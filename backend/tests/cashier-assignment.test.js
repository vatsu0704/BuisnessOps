const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `ca-owner.${RUN_ID}@test.buisnessops.dev`;
const hariEmail = `ca-hari.${RUN_ID}@test.buisnessops.dev`;
const deepEmail = `ca-deep.${RUN_ID}@test.buisnessops.dev`;
const meeraEmail = `ca-meera.${RUN_ID}@test.buisnessops.dev`;
const riderEmail = `ca-rider.${RUN_ID}@test.buisnessops.dev`;
const staffEmail = `ca-staff.${RUN_ID}@test.buisnessops.dev`;
const neverSignedUpEmail = `ca-pending.${RUN_ID}@test.buisnessops.dev`;

/**
 * Requirement 18 — one cashier per branch, one branch per cashier.
 * Requirement 19 — a refusal says what the rule is.
 *
 * The rule has three doors (invite, claim-at-signup, branch-access edit) and one
 * enforcement point, so most of this file is about proving the doors all reach
 * it. The two that are easy to get wrong and impossible to see by hand are the
 * concurrent assignment and the revoked holder, and both have their own case.
 */
describe('One cashier per branch (requirement 18)', () => {
  let ownerToken;
  let businessId;
  let shopA;
  let shopB;
  let shopC;
  const membershipIds = {};
  const tokens = {};
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const url = (suffix) => `/api/businesses/${businessId}${suffix}`;

  /** Give someone their own account, then invite them into the owner's business. */
  async function account(email, name) {
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name,
      businessName: `${name} Solo ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(signup.statusCode).toBe(201);
    businessIdsToClean.push(signup.body.business.id);
    userIdsToClean.push(signup.body.user.id);
    const login = await request(app).post('/api/auth/login').send({ email, password });
    tokens[email] = login.body.token;
  }

  function invite(body) {
    return request(app).post(url('/memberships')).set(auth(ownerToken)).send(body);
  }

  function assign(membershipId, branchId, body = {}) {
    return request(app)
      .post(url(`/memberships/${membershipId}/branch-access`))
      .set(auth(ownerToken))
      .send({ branchId, ...body });
  }

  /** Which branch ids a membership actually holds, straight from the table. */
  async function branchesOf(membershipId) {
    const rows = await prisma.branchAccess.findMany({ where: { membershipId } });
    return rows.map((row) => row.branchId).sort();
  }

  /** How many ACTIVE cashiers hold this branch. The invariant, as a number. */
  function cashierCountOn(branchId) {
    return prisma.branchAccess.count({
      where: { branchId, membership: { businessId, role: 'CASHIER', status: 'ACTIVE' } },
    });
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Assignment Owner',
      businessName: `Assignment Business ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(owner.statusCode).toBe(201);
    ownerToken = owner.body.token;
    businessId = owner.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(owner.body.user.id);

    for (const [name, code] of [
      ['Shop A', 'CAA'],
      ['Shop B', 'CAB'],
      ['Shop C', 'CAC'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata' });
      expect(branch.statusCode).toBe(201);
      if (code === 'CAA') shopA = branch.body;
      else if (code === 'CAB') shopB = branch.body;
      else shopC = branch.body;
    }

    await account(hariEmail, 'Hari');
    await account(deepEmail, 'Deep');
    await account(meeraEmail, 'Meera');
    await account(riderEmail, 'Rider');
    await account(staffEmail, 'Staffer');

    // Hari runs Shop A. Everything below is measured against that.
    const hari = await invite({ email: hariEmail, role: 'CASHIER', branchIds: [shopA.id] });
    expect(hari.statusCode).toBe(201);
    membershipIds[hariEmail] = hari.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  describe('inviting a cashier', () => {
    it('refuses one with no branch at all, before the invite exists', async () => {
      const res = await invite({ email: deepEmail, role: 'CASHIER' });
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0]).toMatchObject({
        code: 'CASHIER_NEEDS_ONE_BRANCH',
        field: 'branchIds',
      });
      // And nothing was created — the rule is not a warning.
      expect(await prisma.membership.count({ where: { businessId, user: { email: deepEmail } } })).toBe(0);
    });

    it('refuses one with two branches', async () => {
      const res = await invite({ email: deepEmail, role: 'CASHIER', branchIds: [shopB.id, shopC.id] });
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0].code).toBe('CASHIER_NEEDS_ONE_BRANCH');
    });

    it('leaves every other role alone — a delivery agent can cover three branches', async () => {
      const res = await invite({
        email: riderEmail,
        role: 'DELIVERY_AGENT',
        branchIds: [shopA.id, shopB.id, shopC.id],
      });
      expect(res.statusCode).toBe(201);
      membershipIds[riderEmail] = res.body.id;
      expect(await branchesOf(res.body.id)).toEqual([shopA.id, shopB.id, shopC.id].sort());
    });

    it('names the cashier already on the branch rather than saying it is taken', async () => {
      const res = await invite({ email: deepEmail, role: 'CASHIER', branchIds: [shopA.id] });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('BRANCH_ALREADY_HAS_CASHIER');
      // Requirement 19: the blocker's name is a param, never baked into the
      // sentence, because the admin's next action depends on knowing who.
      expect(res.body.params).toMatchObject({ branch: 'Shop A', cashier: 'Hari' });
      expect(await prisma.membership.count({ where: { businessId, user: { email: deepEmail } } })).toBe(0);
    });

    it('swaps when the admin confirms, moving the branch in one step', async () => {
      const res = await invite({
        email: deepEmail,
        role: 'CASHIER',
        branchIds: [shopA.id],
        confirm: true,
      });
      expect(res.statusCode).toBe(201);
      membershipIds[deepEmail] = res.body.id;

      // Exactly one holder, and it is the new one.
      expect(await cashierCountOn(shopA.id)).toBe(1);
      expect(await branchesOf(membershipIds[deepEmail])).toEqual([shopA.id]);
      expect(await branchesOf(membershipIds[hariEmail])).toEqual([]);
    });

    it('leaves the displaced cashier inert but intact', async () => {
      const membership = await prisma.membership.findUnique({ where: { id: membershipIds[hariEmail] } });
      expect(membership.status).toBe('ACTIVE');

      // They can still sign in and still belong to the business — they simply
      // reach no branch, which is what the app has to say out loud rather than
      // rendering as a set of empty screens.
      const branches = await request(app).get(url('/branches')).set(auth(tokens[hariEmail]));
      expect(branches.statusCode).toBe(200);
      expect(branches.body).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('moving a cashier', () => {
    it('is a no-op for the branch they already hold, not a conflict with themselves', async () => {
      const res = await assign(membershipIds[deepEmail], shopA.id);
      expect(res.statusCode).toBe(201);
      expect(await branchesOf(membershipIds[deepEmail])).toEqual([shopA.id]);
    });

    it('refuses a second branch, naming the one they have', async () => {
      const res = await assign(membershipIds[deepEmail], shopB.id);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('CASHIER_ALREADY_HAS_BRANCH');
      expect(res.body.params).toMatchObject({ branch: 'Shop B', currentBranch: 'Shop A' });
      expect(await branchesOf(membershipIds[deepEmail])).toEqual([shopA.id]);
    });

    it('moves them on confirmation, leaving exactly one branch', async () => {
      const res = await assign(membershipIds[deepEmail], shopB.id, { confirm: true });
      expect(res.statusCode).toBe(201);
      expect(await branchesOf(membershipIds[deepEmail])).toEqual([shopB.id]);
      // Shop A is free again, which is the point of a move rather than a grant.
      expect(await cashierCountOn(shopA.id)).toBe(0);
    });

    it('states both consequences when the move also displaces somebody', async () => {
      // Hari back on Shop A, so moving Deep onto it displaces Hari AND vacates
      // Shop B. One confirmation, two facts — and the second travels as its own
      // param so the app writes the second clause rather than the server.
      expect((await assign(membershipIds[hariEmail], shopA.id)).statusCode).toBe(201);

      const res = await assign(membershipIds[deepEmail], shopA.id);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('BRANCH_ALREADY_HAS_CASHIER');
      expect(res.body.params).toMatchObject({
        branch: 'Shop A',
        cashier: 'Hari',
        currentBranch: 'Shop B',
      });

      const confirmed = await assign(membershipIds[deepEmail], shopA.id, { confirm: true });
      expect(confirmed.statusCode).toBe(201);
      expect(await branchesOf(membershipIds[deepEmail])).toEqual([shopA.id]);
      expect(await branchesOf(membershipIds[hariEmail])).toEqual([]);
      expect(await cashierCountOn(shopA.id)).toBe(1);
      expect(await cashierCountOn(shopB.id)).toBe(0);
    });

    it('rejects a confirm that is not a boolean rather than reading it as truthy', async () => {
      const res = await assign(membershipIds[hariEmail], shopC.id, { confirm: 'yes' });
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0]).toMatchObject({ code: 'FIELD_MUST_BE_BOOLEAN', field: 'confirm' });
    });
  });

  // -------------------------------------------------------------------------
  describe('the invariant itself', () => {
    it('holds when two admins assign the same branch at the same moment', async () => {
      // Shop C is free, and Hari and Meera both want it. Without the row lock in
      // cashierAssignment.service.js both requests read a free branch and both
      // write, which is the failure this whole design exists to prevent — and it
      // cannot be found by hand, because either request alone is correct.
      const meera = await invite({ email: meeraEmail, role: 'CASHIER', branchIds: [shopB.id] });
      expect(meera.statusCode).toBe(201);
      membershipIds[meeraEmail] = meera.body.id;

      const [first, second] = await Promise.all([
        assign(membershipIds[hariEmail], shopC.id),
        assign(membershipIds[meeraEmail], shopC.id, { confirm: true }),
      ]);

      // One of them got it. Which one is a race and does not matter; that there
      // is exactly one is the whole rule.
      expect([first.statusCode, second.statusCode].filter((code) => code === 201).length).toBeGreaterThanOrEqual(1);
      expect(await cashierCountOn(shopC.id)).toBe(1);
    });

    it('frees the branch the moment its cashier is revoked', async () => {
      const holder = await prisma.branchAccess.findFirstOrThrow({
        where: { branchId: shopC.id, membership: { businessId, role: 'CASHIER' } },
      });

      const revoked = await request(app)
        .post(url(`/memberships/${holder.membershipId}/revoke`))
        .set(auth(ownerToken));
      expect(revoked.statusCode).toBe(200);

      // The BranchAccess row deliberately survives a revoke, so re-inviting
      // restores what somebody had. It must not keep the branch occupied: the
      // rule counts ACTIVE memberships, so Shop C is free with the row still there.
      expect(await prisma.branchAccess.count({ where: { id: holder.id } })).toBe(1);
      expect(await cashierCountOn(shopC.id)).toBe(0);

      const other = Object.entries(membershipIds).find(
        ([email, id]) => id !== holder.membershipId && [hariEmail, deepEmail, meeraEmail].includes(email)
      );
      const res = await assign(other[1], shopC.id, { confirm: true });
      expect(res.statusCode).toBe(201);
      expect(await cashierCountOn(shopC.id)).toBe(1);
    });

    it('gives a re-invited cashier the branch named now, not the one they used to have', async () => {
      // A revoked cashier's rows are vestigial — they hold no branch, because the
      // rule counts ACTIVE memberships. Re-inviting is a fresh decision about
      // access, so the branch in the invite wins outright instead of the invite
      // being refused for conflicting with a branch nobody holds.
      const revoked = await prisma.membership.findFirstOrThrow({
        where: { businessId, role: 'CASHIER', status: 'REVOKED' },
        include: { user: true },
      });
      const freeBranch = [shopA, shopB, shopC].find(async (branch) => (await cashierCountOn(branch.id)) === 0);

      const res = await invite({
        email: revoked.user.email,
        role: 'CASHIER',
        branchIds: [freeBranch.id],
        confirm: true,
      });
      expect(res.statusCode).toBe(201);
      expect(await branchesOf(res.body.id)).toEqual([freeBranch.id]);
    });
  });

  // -------------------------------------------------------------------------
  describe('the claim at signup', () => {
    it('grants the membership and skips a branch taken since the invite was written', async () => {
      // The interesting door: the branch was free when the invite was written and
      // is taken by the time its invitee signs up, and there is nobody to ask.
      // Taking it from the current holder is the silent rewrite requirement 18
      // forbids; refusing the signup would lock someone out of their own account.
      const free = shopC.id;
      await prisma.branchAccess.deleteMany({
        where: { branchId: free, membership: { businessId, role: 'CASHIER' } },
      });

      const invited = await invite({ email: neverSignedUpEmail, role: 'CASHIER', branchIds: [free] });
      expect(invited.statusCode).toBe(201);
      expect(invited.body.pending).toBe(true);

      // Somebody else takes the branch in the interval.
      expect((await assign(membershipIds[hariEmail], free, { confirm: true })).statusCode).toBe(201);

      const signup = await request(app).post('/api/auth/signup').send({
        email: neverSignedUpEmail,
        password,
        name: 'Latecomer',
      });
      expect(signup.statusCode).toBe(201);
      userIdsToClean.push(signup.body.user.id);

      const membership = await prisma.membership.findFirstOrThrow({
        where: { businessId, user: { email: neverSignedUpEmail } },
      });
      expect(membership.role).toBe('CASHIER');
      expect(membership.status).toBe('ACTIVE');
      // A cashier with no branch, which is a real state the app names — and the
      // branch still has exactly one holder.
      expect(await branchesOf(membership.id)).toEqual([]);
      expect(await cashierCountOn(free)).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('the conflict report', () => {
    it('reports memberships that already break the rule instead of rewriting them', async () => {
      // Written straight to the table, which is the only way this state can
      // arise: a membership created before the rule existed. Requirement 18 is
      // explicit that an admin decides who keeps which branch, because nothing
      // but a person knows which cashier is the one still turning up.
      const [first, second] = await prisma.membership.findMany({
        where: { businessId, role: 'CASHIER', status: 'ACTIVE' },
        take: 2,
        orderBy: { joinedAt: 'asc' },
      });
      // Every cashier's access is cleared first, so what the report sees is
      // exactly the three rows written below and nothing left over from the tests
      // above — the assertion is about the report, not about the fixture.
      await prisma.branchAccess.deleteMany({
        where: { membership: { businessId, role: 'CASHIER' } },
      });
      await prisma.branchAccess.createMany({
        data: [
          { membershipId: first.id, branchId: shopA.id },
          { membershipId: second.id, branchId: shopA.id },
          { membershipId: second.id, branchId: shopB.id },
        ],
      });

      const res = await request(app).get(url('/cashier-conflicts')).set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      const shared = res.body.sharedBranches.find((entry) => entry.branch.id === shopA.id);
      expect(shared).toBeDefined();
      expect(shared.cashiers.map((c) => c.membershipId).sort()).toEqual([first.id, second.id].sort());

      const twoBranches = res.body.misassignedCashiers.find((c) => c.membershipId === second.id);
      expect(twoBranches).toMatchObject({ branchCount: 2 });

      // Nothing was touched by reading the report.
      expect(await cashierCountOn(shopA.id)).toBe(2);
    });

    it('lists a cashier with no branch as well as one with too many', async () => {
      const stranded = await prisma.membership.findFirst({
        where: { businessId, role: 'CASHIER', status: 'ACTIVE', branchAccess: { none: {} } },
      });
      expect(stranded).not.toBeNull();

      const res = await request(app).get(url('/cashier-conflicts')).set(auth(ownerToken));
      expect(res.body.misassignedCashiers.find((c) => c.membershipId === stranded.id)).toMatchObject({
        branchCount: 0,
      });
    });

    it('is refused to a role that cannot see the team at all', async () => {
      const staff = await invite({ email: staffEmail, role: 'STAFF', branchIds: [shopA.id] });
      expect(staff.statusCode).toBe(201);

      const res = await request(app).get(url('/cashier-conflicts')).set(auth(tokens[staffEmail]));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });
  });

  // -------------------------------------------------------------------------
  describe('a refusal that says what the rule is (requirement 19)', () => {
    it('carries the capability that was missing, so the app can name the rule', async () => {
      // The app renders the sentence: it mirrors the capability matrix, so from
      // this one param it can say what the action is and which roles hold it —
      // without the server writing a word of prose. "Insufficient permissions"
      // carried none of that.
      const res = await request(app).get(url('/memberships')).set(auth(tokens[staffEmail]));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
      expect(res.body.params).toMatchObject({ capability: 'team:view' });
    });

    it('says which branches a branch-scoped refusal is about being assigned to', async () => {
      // A staff member reaching for a branch they were not given. The code is
      // unchanged; what changed is that its sentence now states the rule instead
      // of asserting that a boundary exists.
      const res = await request(app).get(url(`/branches/${shopC.id}`)).set(auth(tokens[staffEmail]));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
      expect(res.body.message).toMatch(/assigned/i);
    });
  });
});
