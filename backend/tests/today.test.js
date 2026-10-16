const { randomUUID } = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Today at a glance — requirement 33, the figures at the top of Home.
//
// What has to hold:
//   1. Today is each branch's own day, and the figures are that day's.
//   2. A cashier sees their own branch's today, and never costs or profit.
//   3. Spending only for somebody who may read expenses; bills only for somebody
//      who bills.
jest.setTimeout(60000);

const RUN_ID = Date.now();
const password = 'TestPass123!';

describe('Today at a glance', () => {
  let ownerToken;
  let cashierToken;
  let accountantToken;
  let staffToken;
  let businessId;
  let shopAId;
  let shopBId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const url = (suffix) => `/api/businesses/${businessId}${suffix}`;

  async function joinAs(label, role, branchIds) {
    const email = `today-${label}.${RUN_ID}@test.buisnessops.dev`;
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name: `Today ${label}`,
      businessName: `Today ${label} Solo ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    businessIdsToClean.push(signup.body.business.id);
    userIdsToClean.push(signup.body.user.id);
    const invited = await request(app).post(url('/memberships')).set(auth(ownerToken)).send({ email, role, branchIds });
    expect(invited.statusCode).toBe(201);
    return (await request(app).post('/api/auth/login').send({ email, password })).body.token;
  }

  function sell(branchId, amount, token) {
    return request(app)
      .post(url('/counter-sales/sync'))
      .set(auth(token))
      .send({
        sales: [
          {
            clientRef: randomUUID(),
            branchId,
            occurredAt: new Date().toISOString(),
            status: 'CLOSED',
            paymentMethod: 'CASH',
            deviceTokenNumber: Math.floor(Math.random() * 9000) + 100,
            items: [{ name: 'Tea', quantity: 1, unitPrice: amount }],
          },
        ],
      });
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: `today-owner.${RUN_ID}@test.buisnessops.dev`,
      password,
      name: 'Today Owner',
      businessName: `Today Tea ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    ownerToken = owner.body.token;
    businessId = owner.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(owner.body.user.id);

    for (const [name, code] of [
      ['Today Shop A', 'TDA'],
      ['Today Shop B', 'TDB'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata' });
      if (code === 'TDA') shopAId = branch.body.id;
      else shopBId = branch.body.id;
    }

    cashierToken = await joinAs('cashier', 'CASHIER', [shopAId]);
    accountantToken = await joinAs('accountant', 'ACCOUNTANT', []);
    staffToken = await joinAs('staff', 'STAFF', [shopAId]);

    expect((await sell(shopAId, 120, cashierToken)).body.results[0].outcome).toBe('ACCEPTED');
    expect((await sell(shopBId, 80, ownerToken)).body.results[0].outcome).toBe('ACCEPTED');

    const categories = await request(app).get(url('/expense-categories')).set(auth(cashierToken));
    const milk = categories.body.find((category) => category.code === 'MILK');
    const spent = await request(app)
      .post(url('/expenses'))
      .set(auth(cashierToken))
      .send({ branchId: shopAId, categoryId: milk.id, amount: 45 });
    expect(spent.statusCode).toBe(201);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  it('gives the owner every branch’s today, with spending and the latest bills', async () => {
    const res = await request(app).get(url('/today')).set(auth(ownerToken));
    expect(res.statusCode).toBe(200);
    expect(Number(res.body.totals.sales)).toBe(200);
    expect(res.body.totals.saleCount).toBe(2);
    expect(Number(res.body.totals.expenses)).toBe(45);
    expect(res.body.recentBills).toHaveLength(2);
    expect(res.body.recentBills[0]).toMatchObject({ status: 'CLOSED', paymentMethod: 'CASH', itemCount: 1 });
    const key = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
    expect(res.body.branches.every((branch) => branch.dayKey === key)).toBe(true);
  });

  it('gives a cashier their own branch only — and still their bills and spending', async () => {
    const res = await request(app).get(url('/today')).set(auth(cashierToken));
    expect(res.statusCode).toBe(200);
    expect(res.body.branches.map((branch) => branch.branchId)).toEqual([shopAId]);
    expect(Number(res.body.totals.sales)).toBe(120);
    expect(Number(res.body.totals.expenses)).toBe(45);
    expect(res.body.recentBills).toHaveLength(1);
  });

  it('refuses a cashier another branch', async () => {
    const res = await request(app).get(url(`/today?branchId=${shopBId}`)).set(auth(cashierToken));
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
  });

  it('gives the accountant the figures but no bills — they do not bill', async () => {
    const res = await request(app).get(url('/today')).set(auth(accountantToken));
    expect(res.statusCode).toBe(200);
    expect(Number(res.body.totals.sales)).toBe(200);
    expect(res.body.totals.expenses).not.toBeNull();
    expect(res.body.recentBills).toBeNull();
  });

  it('refuses somebody with no business figures at all', async () => {
    const res = await request(app).get(url('/today')).set(auth(staffToken));
    expect(res.statusCode).toBe(403);
    expect(res.body.params.capability).toBe('analytics:viewToday');
  });
});
