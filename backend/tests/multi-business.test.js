const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Requirement 16: one account holds many businesses, instead of one account per
// business.
//
// Most of the machinery for this already existed and was unreachable — a User
// has always been able to hold several memberships, and the app has had a
// working switcher. The only missing piece was a way to create the *second*
// business, since a business could previously only come into existence through
// signup.
jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `multi-owner.${RUN_ID}@test.buisnessops.dev`;
const staffEmail = `multi-staff.${RUN_ID}@test.buisnessops.dev`;

describe('Many businesses under one account', () => {
  let ownerToken;
  let staffToken;
  let firstBusinessId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  const businessPayload = (name) => ({
    name,
    industry: 'FOOD_BEVERAGE',
    country: 'IN',
    defaultCurrency: 'INR',
    timezone: 'Asia/Kolkata',
  });

  beforeAll(async () => {
    const owner = await request(app)
      .post('/api/auth/signup')
      .send({ email: ownerEmail, password, name: 'Multi Owner', ...businessPayload(`Multi First ${RUN_ID}`), businessName: `Multi First ${RUN_ID}` });
    expect(owner.statusCode).toBe(201);
    ownerToken = owner.body.token;
    firstBusinessId = owner.body.business.id;
    businessIdsToClean.push(firstBusinessId);
    userIdsToClean.push(owner.body.user.id);

    const staff = await request(app)
      .post('/api/auth/signup')
      .send({ email: staffEmail, password, name: 'Multi Staff', businessName: `Multi Staff Solo ${RUN_ID}`, industry: 'RETAIL', country: 'IN', defaultCurrency: 'INR', timezone: 'Asia/Kolkata' });
    expect(staff.statusCode).toBe(201);
    staffToken = staff.body.token;
    businessIdsToClean.push(staff.body.business.id);
    userIdsToClean.push(staff.body.user.id);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  it('creates a second business and makes the caller its owner', async () => {
    const res = await request(app)
      .post('/api/businesses')
      .set(auth(ownerToken))
      .send(businessPayload(`Multi Second ${RUN_ID}`));

    expect(res.statusCode).toBe(201);
    expect(res.body.business.name).toBe(`Multi Second ${RUN_ID}`);
    expect(res.body.membership.role).toBe('OWNER');
    expect(res.body.membership.status).toBe('ACTIVE');
    expect(res.body.business.id).not.toBe(firstBusinessId);
    businessIdsToClean.push(res.body.business.id);
  });

  it('lists both businesses on the session, so the switcher can name them', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(ownerToken));
    expect(res.statusCode).toBe(200);

    const names = res.body.user.memberships.map((m) => m.business.name).sort();
    expect(names).toEqual([`Multi First ${RUN_ID}`, `Multi Second ${RUN_ID}`].sort());
    // Every membership carries its business name, which is what lets the
    // switcher render without one request per business.
    for (const m of res.body.user.memberships) {
      expect(m.business.name).toEqual(expect.any(String));
      expect(m.role).toBe('OWNER');
    }
  });

  it('keeps the two businesses isolated — a branch in one is invisible from the other', async () => {
    const second = await request(app)
      .post('/api/businesses')
      .set(auth(ownerToken))
      .send(businessPayload(`Multi Third ${RUN_ID}`));
    expect(second.statusCode).toBe(201);
    const secondId = second.body.business.id;
    businessIdsToClean.push(secondId);

    const branch = await request(app)
      .post(`/api/businesses/${firstBusinessId}/branches`)
      .set(auth(ownerToken))
      .send({ name: 'Only In The First', code: `M1-${RUN_ID % 10000}`, timezone: 'Asia/Kolkata' });
    expect(branch.statusCode).toBe(201);

    const fromSecond = await request(app)
      .get(`/api/businesses/${secondId}/branches`)
      .set(auth(ownerToken));
    expect(fromSecond.statusCode).toBe(200);
    expect(fromSecond.body).toEqual([]);

    // Owning both does not make one reachable through the other's id.
    const guessed = await request(app)
      .get(`/api/businesses/${secondId}/branches/${branch.body.id}`)
      .set(auth(ownerToken));
    expect(guessed.statusCode).toBe(404);
  });

  // Not gated on a capability: the caller has no role in a business that does
  // not exist yet, and someone's ability to start their own business must not
  // depend on the role they hold in somebody else's.
  it('is open to any signed-in account, whatever role they hold elsewhere', async () => {
    const res = await request(app)
      .post('/api/businesses')
      .set(auth(staffToken))
      .send(businessPayload(`Multi Staff Second ${RUN_ID}`));
    expect(res.statusCode).toBe(201);
    businessIdsToClean.push(res.body.business.id);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/businesses').send(businessPayload('No Token'));
    expect(res.statusCode).toBe(401);
  });

  it('validates the fields signup would have validated', async () => {
    const res = await request(app)
      .post('/api/businesses')
      .set(auth(ownerToken))
      .send({ name: '', industry: 'NOT_AN_INDUSTRY', country: 'IN', defaultCurrency: 'INR', timezone: 'Mars/Olympus' });

    expect(res.statusCode).toBe(400);
    const codes = res.body.details.map((d) => d.code);
    expect(codes).toContain('FIELD_REQUIRED');
    expect(codes).toContain('FIELD_MUST_BE_ONE_OF');
    expect(codes).toContain('TIMEZONE_INVALID');
  });

  it('leaves no orphan business when the request is rejected', async () => {
    const before = await prisma.business.count();
    await request(app).post('/api/businesses').set(auth(ownerToken)).send({ name: 'Incomplete' });
    expect(await prisma.business.count()).toBe(before);
  });
});
