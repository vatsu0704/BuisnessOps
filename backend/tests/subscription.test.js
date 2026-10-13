const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { accessState } = require('../src/billing/access');
const subscriptionService = require('../src/services/subscription.service');
const { GRACE_DAYS, TRIAL_DAYS } = require('../src/permissions/plans');

// Requirement 28 — subscription plans. A business pays for a plan multiplied by
// its trading branches; what it may do is its role's capabilities AND its plan's;
// a lapsed plan goes read-only after a grace period, and never deletes anything.
jest.setTimeout(60000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const DAY = 24 * 60 * 60 * 1000;
const TODAY = new Date().toISOString().slice(0, 10);

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const businessPayload = (name) => ({
  businessName: name,
  industry: 'FOOD_BEVERAGE',
  country: 'IN',
  defaultCurrency: 'INR',
  timezone: 'Asia/Kolkata',
});

describe('accessState — where a subscription stands, from dates alone', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const at = (days) => new Date(now.getTime() + days * DAY);

  it('is FULL inside a trial and inside a paid period', () => {
    expect(accessState({ plan: 'FRANCHISE', status: 'TRIALING', trialEndsAt: at(3) }, now).state).toBe('FULL');
    expect(accessState({ plan: 'GROWTH', status: 'ACTIVE', currentPeriodEnd: at(30) }, now).state).toBe('FULL');
  });

  it('gives GRACE_DAYS of full access after the end, then goes read-only', () => {
    const lapsed = (days) => accessState({ plan: 'GROWTH', status: 'ACTIVE', currentPeriodEnd: at(-days) }, now);
    expect(lapsed(1).state).toBe('GRACE');
    expect(lapsed(GRACE_DAYS - 0.5).state).toBe('GRACE');
    expect(lapsed(GRACE_DAYS + 0.5).state).toBe('READ_ONLY');
    expect(lapsed(1).graceEndsAt).toEqual(at(GRACE_DAYS - 1));
  });

  it('reads the trial end for a trial and the period end for a paid plan', () => {
    // A trial whose currentPeriodEnd happens to be in the future is still over.
    const trial = { plan: 'FRANCHISE', status: 'TRIALING', trialEndsAt: at(-30), currentPeriodEnd: at(30) };
    expect(accessState(trial, now).state).toBe('READ_ONLY');
  });

  it('treats a paid plan with no end date as open-ended', () => {
    expect(accessState({ plan: 'GROWTH', status: 'ACTIVE', currentPeriodEnd: null }, now).state).toBe('FULL');
  });

  it('makes a cancelled plan read-only at once, with no grace', () => {
    expect(accessState({ plan: 'GROWTH', status: 'CANCELLED', currentPeriodEnd: at(30) }, now).state).toBe(
      'READ_ONLY'
    );
  });

  it('treats a business with no subscription row as Starter and read-only, never as the top plan', () => {
    expect(accessState(null, now)).toMatchObject({ plan: 'STARTER', state: 'READ_ONLY' });
  });
});

describe('Subscription plans', () => {
  let ownerToken;
  let businessId;
  let branchId;
  let adminToken;
  let adminMembershipId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const url = (path) => `/api/businesses/${businessId}${path}`;

  // Put the business in a given state directly. set-plan.js is tested on its
  // own below; these tests are about what each state allows.
  async function setSubscription(data) {
    await prisma.subscription.update({ where: { businessId }, data });
  }
  const onPlan = (plan, extra = {}) =>
    setSubscription({
      plan,
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      paidBranchCount: null,
      ...extra,
    });

  async function signup(label, extra = {}) {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: `sub-${label}.${RUN_ID}@test.buisnessops.dev`, password, name: `Sub ${label}`, ...extra });
    expect(res.statusCode).toBe(201);
    userIdsToClean.push(res.body.user.id);
    if (res.body.business) businessIdsToClean.push(res.body.business.id);
    return res;
  }

  beforeAll(async () => {
    const owner = await signup('owner', businessPayload(`Sub Business ${RUN_ID}`));
    ownerToken = owner.body.token;
    businessId = owner.body.business.id;

    const branch = await request(app)
      .post(url('/branches'))
      .set(auth(ownerToken))
      .send({ name: 'Sub Shop', code: 'SUB1', timezone: 'Asia/Kolkata' });
    expect(branch.statusCode).toBe(201);
    branchId = branch.body.id;

    // An admin who already has an account joins at once when invited.
    const admin = await signup('admin', businessPayload(`Sub Admin Own ${RUN_ID}`));
    adminToken = admin.body.token;
    const invite = await request(app)
      .post(url('/memberships'))
      .set(auth(ownerToken))
      .send({ email: `sub-admin.${RUN_ID}@test.buisnessops.dev`, role: 'ADMIN', branchIds: [] });
    expect(invite.statusCode).toBe(201);
    adminMembershipId = invite.body.id;
  });

  afterEach(() => onPlan('FRANCHISE'));

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('the trial', () => {
    it('starts every new business on a trial of the top plan, recorded as an event', async () => {
      const fresh = await signup('trial', businessPayload(`Sub Trial ${RUN_ID}`));
      const id = fresh.body.business.id;

      const subscription = await prisma.subscription.findUnique({ where: { businessId: id } });
      expect(subscription).toMatchObject({ plan: 'FRANCHISE', status: 'TRIALING', paidBranchCount: null });
      const days = (subscription.trialEndsAt.getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(TRIAL_DAYS - 0.1);
      expect(days).toBeLessThan(TRIAL_DAYS + 0.1);

      const events = await prisma.billingEvent.findMany({ where: { businessId: id } });
      expect(events.map((event) => event.type)).toEqual(['TRIAL_STARTED']);
    });

    it('starts a trial for a second business under the same account too (requirement 16)', async () => {
      const res = await request(app)
        .post('/api/businesses')
        .set(auth(ownerToken))
        .send({ name: `Sub Second ${RUN_ID}`, industry: 'RETAIL', country: 'IN', defaultCurrency: 'INR', timezone: 'Asia/Kolkata' });
      expect(res.statusCode).toBe(201);
      businessIdsToClean.push(res.body.business.id);

      const subscription = await prisma.subscription.findUnique({ where: { businessId: res.body.business.id } });
      expect(subscription).toMatchObject({ plan: 'FRANCHISE', status: 'TRIALING' });
    });

    it('tells every client its plan on the membership, without the raw row', async () => {
      const me = await request(app).get('/api/auth/me').set(auth(ownerToken));
      const membership = me.body.user.memberships.find((m) => m.businessId === businessId);
      expect(membership.business.subscription).toMatchObject({ plan: 'FRANCHISE', state: 'FULL' });
      expect(membership.business.subscription).not.toHaveProperty('providerSubscriptionId');
    });
  });

  describe('what a plan unlocks', () => {
    it('refuses an owner a capability their plan does not include, naming the plan that does', async () => {
      await onPlan('STARTER');
      const res = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: 'Flour', unit: 'kg', unitPrice: 45 });

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PLAN_FEATURE_LOCKED');
      expect(res.body.params).toEqual({ capability: 'supplyItem:manage', requiredPlan: 'GROWTH' });
    });

    it('still says PERMISSION_DENIED when it is the role that is missing the capability', async () => {
      // The admin's role does not hold billing:manage on any plan.
      const res = await request(app).get(url('/subscription')).set(auth(adminToken));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('leaves Starter capabilities working on Starter', async () => {
      await onPlan('STARTER');
      const expenses = await request(app).get(url('/expense-categories')).set(auth(ownerToken));
      expect(expenses.statusCode).toBe(200);
    });

    it('refuses to invite a role the plan does not include', async () => {
      await onPlan('STARTER');
      const res = await request(app)
        .post(url('/memberships'))
        .set(auth(ownerToken))
        .send({ email: `sub-desk.${RUN_ID}@test.buisnessops.dev`, role: 'WAREHOUSE', branchIds: [] });

      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('PLAN_ROLE_NOT_INCLUDED');
      expect(res.body.params).toEqual({ role: 'WAREHOUSE', requiredPlan: 'GROWTH' });

      const staff = await request(app)
        .post(url('/memberships'))
        .set(auth(ownerToken))
        .send({ email: `sub-staff.${RUN_ID}@test.buisnessops.dev`, role: 'STAFF', branchIds: [branchId] });
      expect(staff.statusCode).toBe(201);
    });

    it('keeps FOCO branches on Franchise, and lets a lower plan keep the ones it has', async () => {
      await onPlan('GROWTH');
      const create = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name: 'Company Shop', code: 'SUBFOCO', timezone: 'Asia/Kolkata', operatingModel: 'FOCO' });
      expect(create.statusCode).toBe(403);
      expect(create.body.params).toEqual({ feature: 'focoBranches', requiredPlan: 'FRANCHISE' });

      await onPlan('FRANCHISE');
      const made = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name: 'Company Shop', code: 'SUBFOCO', timezone: 'Asia/Kolkata', operatingModel: 'FOCO' });
      expect(made.statusCode).toBe(201);

      await onPlan('GROWTH');
      const edit = await request(app)
        .patch(url(`/branches/${made.body.id}`))
        .set(auth(ownerToken))
        .send({ name: 'Company Shop Renamed', operatingModel: 'FOCO' });
      expect(edit.statusCode).toBe(200);

      // Closed again so it does not count against the branch-limit tests below.
      await prisma.branch.update({ where: { id: made.body.id }, data: { status: 'CLOSED' } });
    });

    it('keeps adding vendors on Franchise, and lets a lower plan keep using the ones it has', async () => {
      const vendor = await request(app).post(url('/vendors')).set(auth(ownerToken)).send({ name: 'Sub Water' });
      expect(vendor.statusCode).toBe(201);
      const item = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: 'Water can', unit: 'can', unitPrice: 30, vendorId: vendor.body.id });
      expect(item.statusCode).toBe(201);

      await onPlan('GROWTH');
      const another = await request(app).post(url('/vendors')).set(auth(ownerToken)).send({ name: 'Sub Ice' });
      expect(another.statusCode).toBe(403);
      expect(another.body.params).toEqual({ feature: 'vendors', requiredPlan: 'FRANCHISE' });

      const newItem = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: 'Ice block', unit: 'block', unitPrice: 50, vendorId: vendor.body.id });
      expect(newItem.statusCode).toBe(403);

      // The item already supplied by the vendor can still be repriced.
      const reprice = await request(app)
        .patch(url(`/supply-items/${item.body.id}`))
        .set(auth(ownerToken))
        .send({ unitPrice: 35, vendorId: vendor.body.id });
      expect(reprice.statusCode).toBe(200);
    });
  });

  describe('the branches a plan pays for', () => {
    const createBranch = (code, extra = {}) =>
      request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name: `Shop ${code}`, code, timezone: 'Asia/Kolkata', ...extra });

    it('refuses a trading branch past the paid count, and never counts a warehouse', async () => {
      await onPlan('GROWTH', { paidBranchCount: 1 });

      const second = await createBranch('SUBX1');
      expect(second.statusCode).toBe(409);
      expect(second.body.code).toBe('PLAN_BRANCH_LIMIT');
      expect(second.body.params).toEqual({ paidBranchCount: 1 });

      const warehouse = await createBranch('SUBWH', { kind: 'WAREHOUSE' });
      expect(warehouse.statusCode).toBe(201);

      // Turning the warehouse into a shop would start billing it.
      const convert = await request(app)
        .patch(url(`/branches/${warehouse.body.id}`))
        .set(auth(ownerToken))
        .send({ kind: 'BRANCH' });
      expect(convert.statusCode).toBe(409);
    });

    it('frees a slot when a branch is closed, and counts a reopened one again', async () => {
      await onPlan('GROWTH', { paidBranchCount: 1 });
      await request(app).patch(url(`/branches/${branchId}`)).set(auth(ownerToken)).send({ status: 'CLOSED' });

      const replacement = await createBranch('SUBX2');
      expect(replacement.statusCode).toBe(201);

      const reopen = await request(app)
        .patch(url(`/branches/${branchId}`))
        .set(auth(ownerToken))
        .send({ status: 'ACTIVE' });
      expect(reopen.statusCode).toBe(409);

      await prisma.branch.update({ where: { id: replacement.body.id }, data: { status: 'CLOSED' } });
      await prisma.branch.update({ where: { id: branchId }, data: { status: 'ACTIVE' } });
    });

    it('lets only one of two simultaneous creates take the last paid slot', async () => {
      const inUse = await subscriptionService.countBilledBranches(businessId);
      await onPlan('GROWTH', { paidBranchCount: inUse + 1 });

      const results = await Promise.all([createBranch('SUBR1'), createBranch('SUBR2')]);
      const codes = results.map((res) => res.statusCode).sort();
      expect(codes).toEqual([201, 409]);

      const made = results.find((res) => res.statusCode === 201);
      await prisma.branch.update({ where: { id: made.body.id }, data: { status: 'CLOSED' } });
    });

    it('has no branch limit during the trial', async () => {
      await setSubscription({
        status: 'TRIALING',
        plan: 'FRANCHISE',
        paidBranchCount: null,
        trialEndsAt: new Date(Date.now() + 10 * DAY),
      });
      const res = await createBranch('SUBT1');
      expect(res.statusCode).toBe(201);
      await prisma.branch.update({ where: { id: res.body.id }, data: { status: 'CLOSED' } });
    });
  });

  describe('a plan that has run out', () => {
    it('keeps everything working through the grace period', async () => {
      await onPlan('GROWTH', { currentPeriodEnd: new Date(Date.now() - 1 * DAY) });

      const write = await request(app).post(url('/expense-categories')).set(auth(ownerToken)).send({ name: `Grace ${RUN_ID}` });
      expect(write.statusCode).toBe(201);

      const me = await request(app).get('/api/auth/me').set(auth(ownerToken));
      const membership = me.body.user.memberships.find((m) => m.businessId === businessId);
      expect(membership.business.subscription.state).toBe('GRACE');
    });

    it('goes read-only after grace: writes refused, reads and exports kept', async () => {
      await onPlan('GROWTH', { currentPeriodEnd: new Date(Date.now() - (GRACE_DAYS + 1) * DAY) });

      const write = await request(app).post(url('/expense-categories')).set(auth(ownerToken)).send({ name: `Lapsed ${RUN_ID}` });
      expect(write.statusCode).toBe(402);
      expect(write.body.code).toBe('SUBSCRIPTION_READ_ONLY');

      const read = await request(app).get(url('/branches')).set(auth(ownerToken));
      expect(read.statusCode).toBe(200);

      const exported = await request(app)
        .get(url(`/exports/day-end?date=${TODAY}&branchId=${branchId}`))
        .set(auth(ownerToken));
      expect(exported.statusCode).toBe(200);

      const plan = await request(app).get(url('/subscription')).set(auth(ownerToken));
      expect(plan.statusCode).toBe(200);
      expect(plan.body.state).toBe('READ_ONLY');
    });

    it('still lets an owner take access away, and anyone clear their notifications', async () => {
      await setSubscription({ status: 'CANCELLED' });

      const notifications = await request(app).post(url('/notifications/read-all')).set(auth(ownerToken));
      expect(notifications.statusCode).toBe(200);

      const revoke = await request(app)
        .post(url(`/memberships/${adminMembershipId}/revoke`))
        .set(auth(ownerToken));
      expect(revoke.statusCode).toBe(200);
    });

    it('tells a stranger the business is not theirs, not that its plan ended', async () => {
      await setSubscription({ status: 'CANCELLED' });
      const stranger = await signup('stranger', businessPayload(`Sub Stranger ${RUN_ID}`));
      const res = await request(app).post(url('/expense-categories')).set(auth(stranger.body.token)).send({ name: 'x' });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('TENANT_ACCESS_DENIED');
    });
  });

  describe('setting a plan by hand (scripts/set-plan.js)', () => {
    it('puts the business on a paid plan and records who did it and the payment', async () => {
      const until = new Date(Date.now() + 365 * DAY);
      await subscriptionService.setPlan(businessId, {
        plan: 'GROWTH',
        paidBranchCount: 3,
        interval: 'YEARLY',
        periodEnd: until,
        amount: 35964,
        currency: 'INR',
        reference: `UTR${RUN_ID}`,
        actor: 'test',
      });

      const subscription = await prisma.subscription.findUnique({ where: { businessId } });
      expect(subscription).toMatchObject({ plan: 'GROWTH', status: 'ACTIVE', paidBranchCount: 3, trialEndsAt: null });

      const event = await prisma.billingEvent.findFirst({ where: { businessId, type: 'PLAN_SET' } });
      expect(event).toMatchObject({ actor: 'test', reference: `UTR${RUN_ID}`, plan: 'GROWTH' });
      expect(Number(event.amount)).toBe(35964);
    });

    it('refuses a branch count below the branches already trading', async () => {
      const second = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name: 'Sub Second Shop', code: 'SUBS2', timezone: 'Asia/Kolkata' });
      expect(second.statusCode).toBe(201);

      const inUse = await subscriptionService.countBilledBranches(businessId);
      expect(inUse).toBeGreaterThanOrEqual(2);
      await expect(
        subscriptionService.setPlan(businessId, {
          plan: 'STARTER',
          paidBranchCount: inUse - 1,
          periodEnd: new Date(Date.now() + DAY),
          actor: 'test',
        })
      ).rejects.toThrow(/trading branches in use/);

      await prisma.branch.update({ where: { id: second.body.id }, data: { status: 'CLOSED' } });
    });

    it('moving down a plan leaves every member as they were', async () => {
      const before = await prisma.membership.findMany({ where: { businessId }, orderBy: { id: 'asc' } });
      await subscriptionService.setPlan(businessId, {
        plan: 'STARTER',
        paidBranchCount: 5,
        periodEnd: new Date(Date.now() + 30 * DAY),
        actor: 'test',
      });
      const after = await prisma.membership.findMany({ where: { businessId }, orderBy: { id: 'asc' } });
      expect(after.map((m) => [m.id, m.role, m.status])).toEqual(before.map((m) => [m.id, m.role, m.status]));
    });
  });

  it('leaves a business whose plan lacks the cross-branch view out of the cross-business comparison', async () => {
    const ids = async () => {
      const res = await request(app).get('/api/analytics/cross-business').set(auth(ownerToken));
      expect(res.statusCode).toBe(200);
      return res.body.businesses.map((b) => b.businessId);
    };

    await onPlan('GROWTH');
    expect(await ids()).toContain(businessId);

    await onPlan('STARTER');
    expect(await ids()).not.toContain(businessId);
  });
});
