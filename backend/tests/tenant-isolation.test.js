const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// This is the Phase 0 exit-criteria test from Docs/PROJECT_FLOW.md: a member
// scoped to one branch must not be able to read another branch's data in
// the same business, even by guessing its real id. It runs end-to-end over
// HTTP (signup -> branch creation -> membership invite -> branch scoping ->
// login) against the real dev database, so it cleans up everything it
// creates in afterAll.
//
// That property used to be carried by MANAGER. Requirement 14 made MANAGER
// admin-equivalent and business-wide, so the exit criterion is now carried by
// CASHIER, which is branch-scoped. The property itself is unchanged and still
// enforced — only the role demonstrating it moved. MANAGER's new reach is
// asserted below too, so the widening is a tested decision rather than an
// absence of tests.
//
// WAREHOUSE is here for the case that motivated splitting branch:allAccess from
// staff:viewAllBranches: it reaches every branch's data and no branch's people.
jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `owner.${RUN_ID}@test.buisnessops.dev`;
const managerEmail = `manager.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `cashier.${RUN_ID}@test.buisnessops.dev`;
const warehouseEmail = `warehouse.${RUN_ID}@test.buisnessops.dev`;
const outsiderEmail = `outsider.${RUN_ID}@test.buisnessops.dev`;

function signupPayload(email, label) {
  return {
    email,
    password,
    name: label,
    businessName: `${label} Business ${RUN_ID}`,
    industry: 'RETAIL',
    country: 'IN',
    defaultCurrency: 'INR',
    timezone: 'Asia/Kolkata',
  };
}

describe('Tenant & branch isolation (Phase 0 exit criteria)', () => {
  let ownerToken;
  let managerToken;
  let cashierToken;
  let warehouseToken;
  let outsiderToken;
  let businessId;
  let branchAId;
  let branchBId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  /**
   * Sign someone up (which gives them their own unused solo business), invite
   * them into the business under test with a role, optionally scope them to
   * branches, and return their token.
   *
   * Four near-identical 20-line blocks were about to become six.
   */
  async function joinAs(email, label, role, branchIds = []) {
    const signup = await request(app).post('/api/auth/signup').send(signupPayload(email, label));
    expect(signup.statusCode).toBe(201);
    businessIdsToClean.push(signup.body.business.id);
    userIdsToClean.push(signup.body.user.id);

    const membership = await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, role, branchIds });
    expect(membership.statusCode).toBe(201);

    const login = await request(app).post('/api/auth/login').send({ email, password });
    expect(login.statusCode).toBe(200);
    return login.body.token;
  }

  beforeAll(async () => {
    const ownerSignup = await request(app).post('/api/auth/signup').send(signupPayload(ownerEmail, 'Owner'));
    expect(ownerSignup.statusCode).toBe(201);
    ownerToken = ownerSignup.body.token;
    businessId = ownerSignup.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(ownerSignup.body.user.id);

    const outsiderSignup = await request(app).post('/api/auth/signup').send(signupPayload(outsiderEmail, 'Outsider'));
    expect(outsiderSignup.statusCode).toBe(201);
    outsiderToken = outsiderSignup.body.token;
    businessIdsToClean.push(outsiderSignup.body.business.id);
    userIdsToClean.push(outsiderSignup.body.user.id);

    const branchA = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Branch A', code: 'A', timezone: 'Asia/Kolkata' });
    expect(branchA.statusCode).toBe(201);
    branchAId = branchA.body.id;

    const branchB = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Branch B', code: 'B', timezone: 'Asia/Kolkata' });
    expect(branchB.statusCode).toBe(201);
    branchBId = branchB.body.id;

    // A MANAGER is granted branch A only. The point of the tests below is that
    // this grant no longer narrows them: requirement 14 makes the role
    // business-wide regardless of its BranchAccess rows.
    managerToken = await joinAs(managerEmail, 'Manager', 'MANAGER', [branchAId]);
    // A CASHIER granted branch A only. This is the branch-scoped role now, and
    // therefore the one carrying the Phase 0 exit criterion.
    cashierToken = await joinAs(cashierEmail, 'Cashier', 'CASHIER', [branchAId]);
    // A WAREHOUSE user with NO branch grants at all — it reaches every branch
    // through branch:allAccess, not through BranchAccess rows.
    warehouseToken = await joinAs(warehouseEmail, 'Warehouse', 'WAREHOUSE');
  });

  afterAll(async () => {
    // Business deletes cascade to their branches/memberships/branch-access.
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  it('lets the owner read any branch in their business', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchBId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(branchBId);
  });

  it('lets the cashier read a branch they are scoped to', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchAId}`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(branchAId);
  });

  // The Phase 0 exit criterion itself, now carried by CASHIER.
  it('blocks the cashier from reading a branch in the same business they are not scoped to, even knowing its real id', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchBId}`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(res.statusCode).toBe(403);
  });

  it("excludes the cashier's out-of-scope branch from the list endpoint too", async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(res.statusCode).toBe(200);
    const ids = res.body.map((b) => b.id);
    expect(ids).toContain(branchAId);
    expect(ids).not.toContain(branchBId);
  });

  // Requirement 14: "the manager will also have all the access the admin has".
  // These two assert the widening deliberately, so that if someone later
  // narrows MANAGER again they find out here rather than in production.
  it('lets the manager read a branch they were never granted, because the role is business-wide now', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchBId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(branchBId);
  });

  it('lists every branch for the manager, not just their granted one', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(200);
    const ids = res.body.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining([branchAId, branchBId]));
  });

  // The reason branch:allAccess and staff:viewAllBranches are two capabilities.
  // The order desk ships to every branch, so it reads every branch...
  it('lets the warehouse desk reach every branch despite holding no branch grants', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    expect(res.statusCode).toBe(200);
    const ids = res.body.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining([branchAId, branchBId]));
  });

  // ...and must not thereby acquire that branch's people. Before the split this
  // returned 200, because `branchAccess === null` was read as authority over
  // staff as well as over data.
  it("refuses the warehouse desk a branch's attendance roster", async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchAId}/attendance`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    expect(res.statusCode).toBe(403);
  });

  it('blocks a user with no membership in the business at all, even with a valid token', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchAId}`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.statusCode).toBe(403);
  });

  it('blocks an unauthenticated request outright', async () => {
    const res = await request(app).get(`/api/businesses/${businessId}/branches/${branchAId}`);
    expect(res.statusCode).toBe(401);
  });

  it('lets the owner list the team, including the manager’s branch access', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    // Asserted by role rather than by count, so adding a fixture to this suite
    // doesn't fail a test that was never about how many people there are.
    expect(res.body.map((m) => m.role).sort()).toEqual(
      ['CASHIER', 'MANAGER', 'OWNER', 'WAREHOUSE'].sort()
    );

    const managerRow = res.body.find((m) => m.role === 'MANAGER');
    expect(managerRow.user.email).toBe(managerEmail);
    expect(managerRow.branchAccess.map((ba) => ba.branch.id)).toEqual([branchAId]);
  });

  // Requirement 14. This asserted a 403 until MANAGER became admin-equivalent.
  it('lets a manager list the team, because the role is admin-equivalent now', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(200);
  });

  // The property the test above used to carry, now on a role that genuinely
  // lacks team:view — otherwise widening MANAGER would have quietly deleted the
  // only coverage that team listing is gated at all.
  it('blocks a cashier from listing the team', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(res.statusCode).toBe(403);
  });

  it('blocks the warehouse desk from listing the team', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    expect(res.statusCode).toBe(403);
  });
});
