const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `val-owner.${RUN_ID}@test.buisnessops.dev`;

// A JSON numeric literal outside double range parses to Infinity once the
// server's express.json() runs JSON.parse on it — this is how a client can
// put a non-finite value into a "number" field over the wire. The request
// body below has to be sent as this raw JSON *text* rather than a JS object:
// a JS `1e309` literal is already `Infinity` the instant this file is
// parsed, and JSON.stringify(Infinity) (what supertest/superagent would do
// with a JS object payload) serializes it straight to `null` before it ever
// reaches the wire — so the bug this guards against only reproduces by
// constructing the request body as literal text, the way a real (or buggy)
// client actually would.
function rawJson(obj, rawNumberField, rawNumberLiteral) {
  const withoutField = { ...obj };
  delete withoutField[rawNumberField];
  const body = JSON.stringify(withoutField).replace(/}$/, `,"${rawNumberField}":${rawNumberLiteral}}`);
  return body;
}

describe('Input validation (auth, staff, payroll numeric fields)', () => {
  let ownerToken;
  let businessId;
  let branchId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  beforeAll(async () => {
    const ownerSignup = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Validation Owner',
      businessName: `Validation Business ${RUN_ID}`,
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
      .send({ name: 'Validation Branch', code: 'VAL', timezone: 'Asia/Kolkata' });
    branchId = branch.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('signup', () => {
    it('rejects a malformed email', async () => {
      const res = await request(app).post('/api/auth/signup').send({
        email: 'not-an-email',
        password,
        name: 'Someone',
        businessName: 'Some Biz',
        industry: 'RETAIL',
        country: 'IN',
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/valid email/i);
    });

    it('rejects a password under 8 characters', async () => {
      const res = await request(app).post('/api/auth/signup').send({
        email: `short.${RUN_ID}@test.buisnessops.dev`,
        password: 'short',
        name: 'Someone',
        businessName: 'Some Biz',
        industry: 'RETAIL',
        country: 'IN',
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/8 characters/i);
    });
  });

  describe('membership invite', () => {
    it('rejects a malformed email', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/memberships`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'not-an-email', role: 'STAFF' });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/valid email/i);
    });
  });

  describe('staff creation', () => {
    it('rejects a malformed email when one is given', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ branchId, name: 'Test Person', role: 'Cashier', email: 'not-an-email' });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/valid email/i);
    });

    it('allows an empty-string email to mean "not provided"', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ branchId, name: 'No Email Person', role: 'Cashier', email: '' });
      expect(res.statusCode).toBe(201);
      expect(res.body.userId).toBeNull();
    });

    it('rejects a non-finite baseSalary (JSON number literal that overflows to Infinity)', async () => {
      const body = rawJson({ branchId, name: 'Overflow Person', role: 'Cashier', baseSalary: 0 }, 'baseSalary', '1e309');
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/baseSalary must be a non-negative number/);
    });

    it('rejects a negative baseSalary', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ branchId, name: 'Negative Salary Person', role: 'Cashier', baseSalary: -500 });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/baseSalary must be a non-negative number/);
    });

    it('accepts a valid baseSalary', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ branchId, name: 'Valid Salary Person', role: 'Cashier', baseSalary: 20000 });
      expect(res.statusCode).toBe(201);
      expect(Number(res.body.baseSalary)).toBe(20000);
    });
  });

  describe('payroll generation', () => {
    let staffMemberId;

    beforeAll(async () => {
      const staffMember = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ branchId, name: 'Payroll Person', role: 'Cashier', baseSalary: 24000 });
      staffMemberId = staffMember.body.id;
    });

    it('rejects a non-finite deductions value', async () => {
      const now = new Date();
      const body = rawJson(
        { month: now.getUTCMonth() + 1, year: now.getUTCFullYear(), deductions: 0 },
        'deductions',
        '1e309'
      );
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/deductions must be a non-negative number/);
    });

    it('rejects an out-of-range month', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ month: 13, year: 2026 });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/month is required as 1-12/);
    });
  });
});
