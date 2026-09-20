const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// This is the Phase 0 exit-criteria test from Docs/PROJECT_FLOW.md: a manager
// scoped to one branch must not be able to read another branch's data in
// the same business, even by guessing its real id. It runs end-to-end over
// HTTP (signup -> branch creation -> membership invite -> branch scoping ->
// login) against the real dev database, so it cleans up everything it
// creates in afterAll.
jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `owner.${RUN_ID}@test.buisnessops.dev`;
const managerEmail = `manager.${RUN_ID}@test.buisnessops.dev`;
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
  let outsiderToken;
  let businessId;
  let branchAId;
  let branchBId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  beforeAll(async () => {
    const ownerSignup = await request(app).post('/api/auth/signup').send(signupPayload(ownerEmail, 'Owner'));
    expect(ownerSignup.statusCode).toBe(201);
    ownerToken = ownerSignup.body.token;
    businessId = ownerSignup.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(ownerSignup.body.user.id);

    const managerSignup = await request(app).post('/api/auth/signup').send(signupPayload(managerEmail, 'Manager'));
    expect(managerSignup.statusCode).toBe(201);
    businessIdsToClean.push(managerSignup.body.business.id); // manager's own (unused) solo business
    userIdsToClean.push(managerSignup.body.user.id);

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

    const membership = await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: managerEmail, role: 'MANAGER' });
    expect(membership.statusCode).toBe(201);

    const branchAccess = await request(app)
      .post(`/api/businesses/${businessId}/memberships/${membership.body.id}/branch-access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchId: branchAId });
    expect(branchAccess.statusCode).toBe(201);

    const managerLogin = await request(app).post('/api/auth/login').send({ email: managerEmail, password });
    expect(managerLogin.statusCode).toBe(200);
    managerToken = managerLogin.body.token;
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

  it('lets the manager read a branch they are scoped to', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchAId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(branchAId);
  });

  it('blocks the manager from reading a branch in the same business they are not scoped to, even knowing its real id', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchBId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(403);
  });

  it("excludes the manager's out-of-scope branch from the list endpoint too", async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(200);
    const ids = res.body.map((b) => b.id);
    expect(ids).toContain(branchAId);
    expect(ids).not.toContain(branchBId);
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
    expect(res.body).toHaveLength(2); // owner + invited manager

    const managerRow = res.body.find((m) => m.role === 'MANAGER');
    expect(managerRow.user.email).toBe(managerEmail);
    expect(managerRow.branchAccess.map((ba) => ba.branch.id)).toEqual([branchAId]);
  });

  it('blocks a manager from listing the team (OWNER/ADMIN only)', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(403);
  });
});
