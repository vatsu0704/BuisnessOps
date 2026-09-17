const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `inv-owner.${RUN_ID}@test.buisnessops.dev`;
const newPersonEmail = `inv-new.${RUN_ID}@test.buisnessops.dev`;
const existingPersonEmail = `inv-existing.${RUN_ID}@test.buisnessops.dev`;

describe('Invite -> signup flow', () => {
  let ownerToken;
  let businessId;
  let branchId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  beforeAll(async () => {
    const ownerSignup = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Invite Owner',
      businessName: `Invite Business ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(ownerSignup.statusCode).toBe(201);
    ownerToken = ownerSignup.body.token;
    businessId = ownerSignup.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(ownerSignup.body.user.id);

    const branch = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Invite Branch', code: 'INV', timezone: 'Asia/Kolkata' });
    branchId = branch.body.id;

    // Someone who already has an account before being invited.
    const existingSignup = await request(app).post('/api/auth/signup').send({
      email: existingPersonEmail,
      password,
      name: 'Existing Person',
      businessName: `Existing Person Solo ${RUN_ID}`,
      industry: 'RETAIL',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    businessIdsToClean.push(existingSignup.body.business.id);
    userIdsToClean.push(existingSignup.body.user.id);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  it('inviting someone with no account yet creates a pending invite, not a 404', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: newPersonEmail, role: 'STAFF', branchIds: [branchId] });
    expect(res.statusCode).toBe(201);
    expect(res.body.pending).toBe(true);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.email).toBe(newPersonEmail.toLowerCase());
  });

  it('inviting someone who already has an account joins them immediately', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: existingPersonEmail, role: 'MANAGER', branchIds: [branchId] });
    expect(res.statusCode).toBe(201);
    expect(res.body.pending).toBe(false);
    expect(res.body.status).toBe('ACTIVE');

    const list = await request(app)
      .get(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const joined = list.body.find((m) => m.user.email === existingPersonEmail.toLowerCase());
    expect(joined.branchAccess.map((ba) => ba.branch.id)).toEqual([branchId]);
  });

  it('lists the pending invite for the owner', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.find((i) => i.email === newPersonEmail.toLowerCase())).toBeTruthy();
  });

  it('publicly (unauthenticated) confirms a pending invite by email, and 404s for a non-invited one', async () => {
    const found = await request(app).get(`/api/invites/lookup?email=${encodeURIComponent(newPersonEmail)}`);
    expect(found.statusCode).toBe(200);
    expect(found.body.role).toBe('STAFF');
    expect(found.body.businessName).toBe(`Invite Business ${RUN_ID}`);

    const notFound = await request(app).get(
      `/api/invites/lookup?email=${encodeURIComponent(`nobody.${RUN_ID}@test.buisnessops.dev`)}`
    );
    expect(notFound.statusCode).toBe(404);
  });

  it('rejects a fresh signup with no pending invite and no business details', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: `no-invite-no-business.${RUN_ID}@test.buisnessops.dev`,
      password,
      name: 'Nobody',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required to create a new business/);
  });

  it('claims the pending invite at signup instead of creating a new business', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: newPersonEmail,
      password,
      name: 'New Person',
      // No businessName/industry/country/defaultCurrency/timezone at all —
      // this is the whole point: an invited signup doesn't need them.
    });
    expect(res.statusCode).toBe(201);
    userIdsToClean.push(res.body.user.id);

    expect(res.body.business.id).toBe(businessId);
    expect(res.body.user.memberships).toHaveLength(1);
    expect(res.body.user.memberships[0]).toMatchObject({ businessId, role: 'STAFF', status: 'ACTIVE' });

    // Branch access from the invite's branchIds carried over.
    const list = await request(app)
      .get(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const joined = list.body.find((m) => m.user.email === newPersonEmail.toLowerCase());
    expect(joined.branchAccess.map((ba) => ba.branch.id)).toEqual([branchId]);

    // The invite is no longer pending.
    const invites = await request(app)
      .get(`/api/businesses/${businessId}/invites`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(invites.body.find((i) => i.email === newPersonEmail.toLowerCase())).toBeUndefined();
  });

  it('logs in as the invited person and lands on the business they were invited to, not a new one', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: newPersonEmail, password });
    expect(res.statusCode).toBe(200);
    expect(res.body.business.id).toBe(businessId);
  });
});
