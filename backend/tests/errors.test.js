const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { renderMessage, fail, validationFailure, fieldError } = require('../src/errors');
const { API_MESSAGES, FIELD_MESSAGES } = require('../src/errors/catalog');

jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `err-owner.${RUN_ID}@test.buisnessops.dev`;

// Every failure used to reach the app as a hardcoded English sentence, in an
// app that ships in four languages. These cover the contract that replaced it:
// a stable code, its parameters, and English only as the fallback.
describe('The error contract', () => {
  let ownerToken;
  let businessId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Error Owner',
      businessName: `Error Business ${RUN_ID}`,
      industry: 'RETAIL',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    ownerToken = res.body.token;
    businessId = res.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(res.body.user.id);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('the catalog', () => {
    it('has no empty or duplicated messages', () => {
      const all = { ...API_MESSAGES, ...FIELD_MESSAGES };
      for (const [code, text] of Object.entries(all)) {
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
      }
      // A code appearing in both maps would render differently depending on
      // which one was consulted first.
      const overlap = Object.keys(API_MESSAGES).filter((code) => code in FIELD_MESSAGES);
      expect(overlap).toEqual([]);
    });

    it('interpolates parameters, and leaves a missing one visible rather than blank', () => {
      expect(renderMessage('PUNCH_OUTSIDE_GEOFENCE', { distance: 120, radius: 50 })).toBe(
        'You are 120m from the branch, outside the allowed 50m radius'
      );
      // Better a visible placeholder than a sentence with a hole in it, which
      // reads as finished text and hides the bug.
      expect(renderMessage('PUNCH_OUTSIDE_GEOFENCE', { distance: 120 })).toContain('{{radius}}');
    });

    it('falls back to the code itself when a code is unknown', () => {
      expect(renderMessage('NOT_A_REAL_CODE')).toBe('NOT_A_REAL_CODE');
    });

    it('carries the code, status and params onto the error object', () => {
      const err = fail('BRANCH_NOT_FOUND', 404);
      expect(err.code).toBe('BRANCH_NOT_FOUND');
      expect(err.status).toBe(404);
      expect(err.message).toBe('Branch not found');
    });
  });

  describe('on the wire', () => {
    it('names an unmatched route, with the path as a parameter', async () => {
      const res = await request(app).get('/api/nope');
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('ROUTE_NOT_FOUND');
      expect(res.body.params.path).toBe('/api/nope');
      expect(res.body.message).toBe('Route not found: /api/nope');
    });

    it('names a missing Authorization header', async () => {
      const res = await request(app).get(`/api/businesses/${businessId}/branches`);
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('AUTH_HEADER_MISSING');
    });

    it('names a rejected token', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/branches`)
        .set('Authorization', 'Bearer not-a-real-token');
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('names a business the caller does not belong to', async () => {
      const res = await request(app)
        .get('/api/businesses/00000000-0000-0000-0000-000000000000/branches')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('TENANT_ACCESS_DENIED');
    });

    it('names a failure raised deep in a service, not just in middleware', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/branches/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('BRANCH_NOT_FOUND');
    });

    it('returns a code per rejected field, alongside the English rendering', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/branches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ code: 'X', timezone: 'Mars/Olympus_Mons' });

      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');

      const byField = Object.fromEntries(res.body.details.map((d) => [d.field, d.code]));
      expect(byField.name).toBe('FIELD_REQUIRED');
      expect(byField.timezone).toBe('TIMEZONE_INVALID');

      // The old `errors` array is still a plain list of English strings, so an
      // app build from before this change keeps rendering something readable
      // instead of "[object Object]".
      expect(res.body.errors).toEqual(expect.arrayContaining(['name is required']));
      for (const line of res.body.errors) expect(typeof line).toBe('string');
    });

    it('renders the English array from the details, so the two cannot disagree', () => {
      const body = validationFailure([
        fieldError('FIELD_MAX_LENGTH', 'notes', { max: 500 }),
        fieldError('FIELD_REQUIRED', 'name'),
      ]);
      expect(body.errors).toEqual(['notes must be 500 characters or fewer', 'name is required']);
      expect(body.details).toHaveLength(2);
    });
  });
});
