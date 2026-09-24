const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Requirement 4: products on the home page after login, and every branch able
// to add its own.
//
// Two scopes share one table — a product with no branchId is the whole
// business's, one with a branchId is that branch's alone — so most of what can
// go wrong here is a scope leaking: a branch seeing another branch's private
// products, or a cashier quietly adding one to every branch's catalog.
jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `prod-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierAEmail = `prod-cashier-a.${RUN_ID}@test.buisnessops.dev`;
const cashierBEmail = `prod-cashier-b.${RUN_ID}@test.buisnessops.dev`;

describe('Product catalog', () => {
  let ownerToken;
  let cashierAToken;
  let cashierBToken;
  let businessId;
  let branchAId;
  let branchBId;
  let sharedProductId;
  let branchAProductId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const url = (suffix) => `/api/businesses/${businessId}${suffix}`;

  async function joinAs(email, label, role, branchIds) {
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name: label,
      businessName: `${label} Solo ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(signup.statusCode).toBe(201);
    businessIdsToClean.push(signup.body.business.id);
    userIdsToClean.push(signup.body.user.id);

    const membership = await request(app)
      .post(url('/memberships'))
      .set(auth(ownerToken))
      .send({ email, role, branchIds });
    expect(membership.statusCode).toBe(201);

    const login = await request(app).post('/api/auth/login').send({ email, password });
    return login.body.token;
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Product Owner',
      businessName: `Product Business ${RUN_ID}`,
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
      ['Product Branch A', 'PRA'],
      ['Product Branch B', 'PRB'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata' });
      expect(branch.statusCode).toBe(201);
      if (code === 'PRA') branchAId = branch.body.id;
      else branchBId = branch.body.id;
    }

    cashierAToken = await joinAs(cashierAEmail, 'Cashier A', 'CASHIER', [branchAId]);
    cashierBToken = await joinAs(cashierBEmail, 'Cashier B', 'CASHIER', [branchBId]);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('business-wide products', () => {
    it('is created by an owner with no branchId and priced for everyone', async () => {
      const res = await request(app)
        .post(url('/products'))
        .set(auth(ownerToken))
        .send({ name: 'Masala Chai', unit: 'cup', category: 'Beverages', sellPrice: 20, costPrice: 8 });

      expect(res.statusCode).toBe(201);
      expect(res.body.branchId).toBeNull();
      expect(res.body.isActive).toBe(true);
      sharedProductId = res.body.id;
    });

    it('appears in every branch’s catalog at the business price', async () => {
      for (const [token, branchId] of [
        [cashierAToken, branchAId],
        [cashierBToken, branchBId],
      ]) {
        const res = await request(app).get(url(`/products?branchId=${branchId}`)).set(auth(token));
        expect(res.statusCode).toBe(200);
        const chai = res.body.find((p) => p.id === sharedProductId);
        expect(chai).toBeDefined();
        expect(Number(chai.effectiveSellPrice)).toBe(20);
        // No override exists yet, so the branch falls back to the default.
        expect(chai.branchDetail).toBeNull();
      }
    });

    it('cannot be created by a branch-scoped role', async () => {
      const res = await request(app)
        .post(url('/products'))
        .set(auth(cashierAToken))
        .send({ name: 'Sneaky Business-Wide', unit: 'each' });

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PRODUCT_BUSINESS_WIDE_NOT_PERMITTED');
    });
  });

  describe('branch-only products', () => {
    it('is created by the cashier of that branch', async () => {
      const res = await request(app)
        .post(url('/products'))
        .set(auth(cashierAToken))
        .send({ name: 'Branch A Special', unit: 'plate', sellPrice: 90, branchId: branchAId });

      expect(res.statusCode).toBe(201);
      expect(res.body.branchId).toBe(branchAId);
      branchAProductId = res.body.id;
    });

    // The point of requirement 4's second half: separate, not shared.
    it('is invisible to another branch', async () => {
      const res = await request(app).get(url(`/products?branchId=${branchBId}`)).set(auth(cashierBToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.map((p) => p.id)).not.toContain(branchAProductId);
    });

    it('is visible to its own branch', async () => {
      const res = await request(app).get(url(`/products?branchId=${branchAId}`)).set(auth(cashierAToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.map((p) => p.id)).toContain(branchAProductId);
    });

    it('cannot be created in a branch the caller cannot reach', async () => {
      const res = await request(app)
        .post(url('/products'))
        .set(auth(cashierAToken))
        .send({ name: 'Planted In B', unit: 'each', branchId: branchBId });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('cannot be promoted to the whole business by a branch-scoped role', async () => {
      const res = await request(app)
        .patch(url(`/products/${branchAProductId}`))
        .set(auth(cashierAToken))
        .send({ branchId: null });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PRODUCT_BUSINESS_WIDE_NOT_PERMITTED');
    });
  });

  describe('per-branch pricing', () => {
    it('overrides the business price for one branch only', async () => {
      const set = await request(app)
        .put(url(`/products/${sharedProductId}/branches/${branchAId}/pricing`))
        .set(auth(cashierAToken))
        .send({ costPrice: 9, sellPrice: 25 });
      expect(set.statusCode).toBe(200);

      const atA = await request(app).get(url(`/products?branchId=${branchAId}`)).set(auth(cashierAToken));
      expect(Number(atA.body.find((p) => p.id === sharedProductId).effectiveSellPrice)).toBe(25);

      const atB = await request(app).get(url(`/products?branchId=${branchBId}`)).set(auth(cashierBToken));
      expect(Number(atB.body.find((p) => p.id === sharedProductId).effectiveSellPrice)).toBe(20);
    });

    it('falls back to the business price once the override is cleared', async () => {
      const cleared = await request(app)
        .delete(url(`/products/${sharedProductId}/branches/${branchAId}/pricing`))
        .set(auth(cashierAToken));
      expect(cleared.statusCode).toBe(200);

      const atA = await request(app).get(url(`/products?branchId=${branchAId}`)).set(auth(cashierAToken));
      expect(Number(atA.body.find((p) => p.id === sharedProductId).effectiveSellPrice)).toBe(20);
    });

    it('refuses to price a branch the caller cannot reach', async () => {
      const res = await request(app)
        .put(url(`/products/${sharedProductId}/branches/${branchBId}/pricing`))
        .set(auth(cashierAToken))
        .send({ costPrice: 1, sellPrice: 2 });
      expect(res.statusCode).toBe(403);
    });

    it('requires both prices, so half an override cannot silently half-apply', async () => {
      const res = await request(app)
        .put(url(`/products/${sharedProductId}/branches/${branchAId}/pricing`))
        .set(auth(cashierAToken))
        .send({ sellPrice: 30 });
      expect(res.statusCode).toBe(400);
      expect(res.body.details.map((d) => d.field)).toContain('costPrice');
    });
  });

  describe('withdrawing a product', () => {
    it('drops it from every catalog when switched off business-wide', async () => {
      const off = await request(app)
        .patch(url(`/products/${sharedProductId}`))
        .set(auth(ownerToken))
        .send({ isActive: false });
      expect(off.statusCode).toBe(200);

      const atA = await request(app).get(url(`/products?branchId=${branchAId}`)).set(auth(cashierAToken));
      expect(atA.body.map((p) => p.id)).not.toContain(sharedProductId);

      // Still there when explicitly asked for, so it can be switched back on.
      const withInactive = await request(app)
        .get(url(`/products?branchId=${branchAId}&includeInactive=true`))
        .set(auth(cashierAToken));
      expect(withInactive.body.map((p) => p.id)).toContain(sharedProductId);

      await request(app)
        .patch(url(`/products/${sharedProductId}`))
        .set(auth(ownerToken))
        .send({ isActive: true });
    });

    it('lets one branch withdraw a product the others still sell', async () => {
      await request(app)
        .put(url(`/products/${sharedProductId}/branches/${branchAId}/pricing`))
        .set(auth(cashierAToken))
        .send({ costPrice: 8, sellPrice: 20, isActive: false });

      const atA = await request(app).get(url(`/products?branchId=${branchAId}`)).set(auth(cashierAToken));
      expect(atA.body.map((p) => p.id)).not.toContain(sharedProductId);

      const atB = await request(app).get(url(`/products?branchId=${branchBId}`)).set(auth(cashierBToken));
      expect(atB.body.map((p) => p.id)).toContain(sharedProductId);
    });
  });

  describe('access', () => {
    it('refuses a cashier the catalog of a branch they cannot reach', async () => {
      const res = await request(app).get(url(`/products?branchId=${branchBId}`)).set(auth(cashierAToken));
      expect(res.statusCode).toBe(403);
    });

    it('never shows a branch-scoped role another branch’s products, even unfiltered', async () => {
      const res = await request(app).get(url('/products')).set(auth(cashierBToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.map((p) => p.id)).not.toContain(branchAProductId);
    });

    it('rejects a negative price', async () => {
      const res = await request(app)
        .post(url('/products'))
        .set(auth(ownerToken))
        .send({ name: 'Free Money', unit: 'each', sellPrice: -5 });
      expect(res.statusCode).toBe(400);
      expect(res.body.details.map((d) => d.code)).toContain('FIELD_MUST_BE_NON_NEGATIVE');
    });
  });
});
