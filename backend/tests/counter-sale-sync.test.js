const { randomUUID } = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { GRACE_DAYS } = require('../src/permissions/plans');

// Paid counter sales from the phone — requirements 29, 30 and 32.
//
// What has to hold, because each one fails silently rather than loudly:
//   1. A sale sent twice is recorded once (a lost answer is resent).
//   2. A token the phone printed is kept when it is free, and a clash is
//      renumbered with the printed number remembered, never a 500.
//   3. One refused sale never holds back the rest of the queue.
//   4. The sale lands on the BRANCH's day, not the UTC day.
jest.setTimeout(60000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const DAY = 24 * 60 * 60 * 1000;
const IST_OFFSET = 330 * 60 * 1000;

/** The Asia/Kolkata calendar day of an instant. India keeps no daylight saving. */
function istKey(instant) {
  return new Date(instant.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}

describe('Counter sale sync', () => {
  let ownerToken;
  let cashierToken;
  let businessId;
  let branchAId;
  let branchBId;
  let warehouseId;
  let chaiId;
  let foreignProductId;
  let foreignBranchId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const url = (suffix) => `/api/businesses/${businessId}${suffix}`;

  function sale(overrides = {}) {
    return {
      clientRef: randomUUID(),
      branchId: branchAId,
      occurredAt: new Date().toISOString(),
      status: 'CLOSED',
      paymentMethod: 'UPI',
      deviceTokenNumber: 1,
      items: [{ productId: chaiId, name: 'Sync Chai', quantity: 2, unitPrice: 25 }],
      ...overrides,
    };
  }

  function sync(sales, token = cashierToken) {
    return request(app).post(url('/counter-sales/sync')).set(auth(token)).send({ sales });
  }

  async function onPlan(plan, extra = {}) {
    await prisma.subscription.update({
      where: { businessId },
      data: {
        plan,
        status: 'ACTIVE',
        trialEndsAt: null,
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        paidBranchCount: null,
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: `sync-owner.${RUN_ID}@test.buisnessops.dev`,
      password,
      name: 'Sync Owner',
      businessName: `Sync Tea ${RUN_ID}`,
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

    for (const [name, code, kind] of [
      ['Sync Branch A', 'SYA', 'BRANCH'],
      ['Sync Branch B', 'SYB', 'BRANCH'],
      ['Sync Warehouse', 'SYW', 'WAREHOUSE'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, kind, timezone: 'Asia/Kolkata' });
      expect(branch.statusCode).toBe(201);
      if (code === 'SYA') branchAId = branch.body.id;
      else if (code === 'SYB') branchBId = branch.body.id;
      else warehouseId = branch.body.id;
    }

    const chai = await request(app)
      .post(url('/products'))
      .set(auth(ownerToken))
      .send({ name: 'Sync Chai', unit: 'cup', sellPrice: 20 });
    chaiId = chai.body.id;

    const cashierEmail = `sync-cashier.${RUN_ID}@test.buisnessops.dev`;
    const cashierSignup = await request(app).post('/api/auth/signup').send({
      email: cashierEmail,
      password,
      name: 'Sync Cashier',
      businessName: `Sync Cashier Solo ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    businessIdsToClean.push(cashierSignup.body.business.id);
    userIdsToClean.push(cashierSignup.body.user.id);
    const invited = await request(app)
      .post(url('/memberships'))
      .set(auth(ownerToken))
      .send({ email: cashierEmail, role: 'CASHIER', branchIds: [branchAId] });
    expect(invited.statusCode).toBe(201);
    cashierToken = (await request(app).post('/api/auth/login').send({ email: cashierEmail, password })).body.token;

    // A product that belongs to somebody else's business.
    const foreign = await request(app)
      .post(`/api/businesses/${cashierSignup.body.business.id}/products`)
      .set(auth(cashierSignup.body.token))
      .send({ name: 'Not Yours', unit: 'cup', sellPrice: 99 });
    foreignProductId = foreign.body.id;
    const foreignBranch = await request(app)
      .post(`/api/businesses/${cashierSignup.body.business.id}/branches`)
      .set(auth(cashierSignup.body.token))
      .send({ name: 'Somebody Else', code: 'ELS', timezone: 'Asia/Kolkata' });
    foreignBranchId = foreignBranch.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('recording a sale', () => {
    it('records the sale at the price the phone charged and projects it into the sales', async () => {
      const sent = sale({ deviceTokenNumber: 41 });
      const res = await sync([sent]);
      expect(res.statusCode).toBe(200);
      const [result] = res.body.results;
      expect(result).toMatchObject({ clientRef: sent.clientRef, outcome: 'ACCEPTED', status: 'CLOSED' });
      expect(Number(result.totalAmount)).toBe(50);

      const order = await prisma.counterOrder.findUnique({
        where: { id: result.orderId },
        include: { items: true, transaction: true },
      });
      expect(order.paymentMethod).toBe('UPI');
      expect(order.syncedAt).not.toBeNull();
      // 25, not the catalog's 20: the money was taken at 25.
      expect(Number(order.items[0].unitPrice)).toBe(25);
      expect(order.transaction).toMatchObject({ source: 'COUNTER', status: 'COMPLETED', paymentMethod: 'UPI' });
      expect(Number(order.transaction.totalAmount)).toBe(50);
    });

    it('files a sale on the branch’s own day, not the UTC day', async () => {
      // 18:50 UTC two days ago is 00:20 the next morning in Kolkata.
      const at = new Date(Date.now() - 2 * DAY);
      at.setUTCHours(18, 50, 0, 0);
      const res = await sync([sale({ occurredAt: at.toISOString(), deviceTokenNumber: 1 })]);
      expect(res.body.results[0].outcome).toBe('ACCEPTED');
      expect(res.body.results[0].tokenDate).toBe(istKey(at));
      expect(res.body.results[0].tokenDate).not.toBe(at.toISOString().slice(0, 10));
    });

    it('returns the first copy when the same sale is sent again', async () => {
      const sent = sale({ deviceTokenNumber: 51 });
      const first = await sync([sent]);
      const again = await sync([sent]);
      expect(again.body.results[0]).toMatchObject({
        outcome: 'DUPLICATE',
        orderId: first.body.results[0].orderId,
        tokenNumber: first.body.results[0].tokenNumber,
      });
      const copies = await prisma.counterOrder.count({ where: { businessId, clientRef: sent.clientRef } });
      expect(copies).toBe(1);
      const projections = await prisma.transaction.count({
        where: { branchId: branchAId, externalId: `counter:${first.body.results[0].orderId}` },
      });
      expect(projections).toBe(1);
    });

    it('records two copies sent at the same moment only once', async () => {
      const sent = sale({ deviceTokenNumber: 61 });
      const [a, b] = await Promise.all([sync([sent]), sync([sent])]);
      const outcomes = [a.body.results[0].outcome, b.body.results[0].outcome].sort();
      expect(outcomes).toEqual(['ACCEPTED', 'DUPLICATE']);
      expect(await prisma.counterOrder.count({ where: { businessId, clientRef: sent.clientRef } })).toBe(1);
    });

    it('refuses a different bill that reuses a reference', async () => {
      const sent = sale({ deviceTokenNumber: 71 });
      await sync([sent]);
      const res = await sync([{ ...sent, items: [{ name: 'Something else', quantity: 1, unitPrice: 999 }] }]);
      expect(res.body.results[0]).toMatchObject({ outcome: 'REJECTED', code: 'COUNTER_SALE_REF_CONFLICT' });
    });

    it('keeps the line but drops the link to another business’s product', async () => {
      const res = await sync([
        sale({ deviceTokenNumber: 81, items: [{ productId: foreignProductId, name: 'Odd tea', quantity: 1, unitPrice: 30 }] }),
      ]);
      expect(res.body.results[0].outcome).toBe('ACCEPTED');
      const item = await prisma.counterOrderItem.findFirst({ where: { counterOrderId: res.body.results[0].orderId } });
      expect(item).toMatchObject({ productId: null, productNameSnapshot: 'Odd tea' });
    });
  });

  describe('tokens', () => {
    it('keeps the phone’s number when it is free, and the counter moves past it', async () => {
      const at = new Date(Date.now() - 10 * DAY);
      at.setUTCHours(6, 0, 0, 0);
      const res = await sync([sale({ occurredAt: at.toISOString(), deviceTokenNumber: 7 })]);
      expect(res.body.results[0]).toMatchObject({ outcome: 'ACCEPTED', tokenNumber: 7, renumbered: false });

      const counter = await prisma.branchTokenCounter.findUnique({
        where: { branchId_tokenDate: { branchId: branchAId, tokenDate: new Date(`${istKey(at)}T00:00:00.000Z`) } },
      });
      expect(counter.lastNumber).toBe(7);
    });

    it('renumbers a clash and remembers the number that was printed', async () => {
      const at = new Date(Date.now() - 11 * DAY);
      at.setUTCHours(6, 0, 0, 0);
      const first = await sync([sale({ occurredAt: at.toISOString(), deviceTokenNumber: 3 })]);
      expect(first.body.results[0].tokenNumber).toBe(3);

      // A second phone, offline at the same branch, printed 3 as well.
      const clash = await sync([sale({ occurredAt: at.toISOString(), deviceTokenNumber: 3 })]);
      expect(clash.body.results[0]).toMatchObject({
        outcome: 'ACCEPTED',
        tokenNumber: 4,
        renumbered: true,
        deviceTokenNumber: 3,
      });
    });

    it('never lets the old open-an-order path reuse a number the phone took', async () => {
      const today = await request(app).get(url(`/branches/${branchBId}/counter-day`)).set(auth(ownerToken));
      const next = today.body.lastTokenNumber + 5;
      const res = await sync([sale({ branchId: branchBId, deviceTokenNumber: next })], ownerToken);
      expect(res.body.results[0].tokenNumber).toBe(next);

      const opened = await request(app).post(url('/counter-orders')).set(auth(ownerToken)).send({ branchId: branchBId });
      expect(opened.statusCode).toBe(201);
      expect(opened.body.tokenNumber).toBe(next + 1);
    });

    it('files a sale the phone dated in the future under now', async () => {
      const ahead = new Date(Date.now() + 60 * 60 * 1000);
      const res = await sync([sale({ occurredAt: ahead.toISOString(), deviceTokenNumber: 91 })]);
      expect(res.body.results[0]).toMatchObject({ outcome: 'ACCEPTED', clockAdjusted: true });
      expect(res.body.results[0].tokenDate).toBe(istKey(new Date()));
    });
  });

  describe('one sale at a time', () => {
    it('refuses only the sale on a closed day; the rest of the batch lands', async () => {
      const closedAt = new Date(Date.now() - 20 * DAY);
      closedAt.setUTCHours(6, 0, 0, 0);
      const closed = await request(app)
        .post(url(`/branches/${branchAId}/counter-day/close`))
        .set(auth(ownerToken))
        .send({ date: istKey(closedAt) });
      expect(closed.statusCode).toBe(201);

      const res = await sync([
        sale({ occurredAt: closedAt.toISOString(), deviceTokenNumber: 1 }),
        sale({ deviceTokenNumber: 101 }),
      ]);
      expect(res.body.results[0]).toMatchObject({ outcome: 'REJECTED', code: 'COUNTER_ORDER_DAY_CLOSED' });
      expect(res.body.results[1].outcome).toBe('ACCEPTED');
    });

    it('refuses a branch the cashier cannot reach, and a warehouse', async () => {
      const res = await sync([sale({ branchId: branchBId, deviceTokenNumber: 111 })]);
      expect(res.body.results[0]).toMatchObject({ outcome: 'REJECTED', code: 'BRANCH_ACCESS_DENIED' });

      const warehouse = await sync([sale({ branchId: warehouseId, deviceTokenNumber: 1 })], ownerToken);
      expect(warehouse.body.results[0]).toMatchObject({ outcome: 'REJECTED', code: 'BRANCH_IS_WAREHOUSE' });
    });

    it('never records a sale into another business, even for an owner who reaches every branch', async () => {
      const res = await sync([sale({ branchId: foreignBranchId, deviceTokenNumber: 1 })], ownerToken);
      expect(res.body.results[0]).toMatchObject({ outcome: 'REJECTED', code: 'BRANCH_NOT_FOUND_IN_BUSINESS' });
      expect(await prisma.counterOrder.count({ where: { branchId: foreignBranchId } })).toBe(0);
    });

    it('reports a malformed sale against itself and keeps its place in the results', async () => {
      const good = sale({ deviceTokenNumber: 121 });
      const res = await sync([{ ...sale(), clientRef: 'not-a-uuid' }, good]);
      expect(res.statusCode).toBe(200);
      expect(res.body.results[0]).toMatchObject({
        outcome: 'REJECTED',
        code: 'COUNTER_SALE_INVALID',
        params: { field: 'clientRef' },
      });
      expect(res.body.results[1]).toMatchObject({ clientRef: good.clientRef, outcome: 'ACCEPTED' });
    });

    it('refuses a batch that is too big', async () => {
      const res = await sync(Array.from({ length: 21 }, () => sale()));
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0].code).toBe('COUNTER_SYNC_TOO_MANY_SALES');
    });
  });

  describe('voids', () => {
    it('voids a recorded sale and takes it out of the sales', async () => {
      const sent = sale({ deviceTokenNumber: 131 });
      const first = await sync([sent]);
      const res = await sync([{ ...sent, status: 'VOID' }]);
      expect(res.body.results[0]).toMatchObject({ outcome: 'ACCEPTED', status: 'VOID' });

      const order = await prisma.counterOrder.findUnique({
        where: { id: first.body.results[0].orderId },
        include: { transaction: true },
      });
      expect(order.transaction.status).toBe('VOIDED');
    });

    it('records a sale voided before it ever synced, so its token is accounted for', async () => {
      const res = await sync([sale({ status: 'VOID', deviceTokenNumber: 141 })]);
      expect(res.body.results[0]).toMatchObject({ outcome: 'ACCEPTED', status: 'VOID', tokenNumber: 141 });
    });
  });

  describe('the counter’s context', () => {
    it('gives the cashier the payee, the receipt header, the last token and today’s spending', async () => {
      let day = await request(app).get(url(`/branches/${branchAId}/counter-day`)).set(auth(cashierToken));
      expect(day.statusCode).toBe(200);
      expect(day.body.payee).toBeNull();
      expect(day.body.utcOffsetMinutes).toBe(330);
      expect(day.body.todayKey).toBe(istKey(new Date()));
      expect(day.body.lastTokenNumber).toBeGreaterThanOrEqual(141);
      expect(day.body.receiptHeader).toMatchObject({ businessName: `Sync Tea ${RUN_ID}`, branchCode: 'SYA', phone: null });

      // Somebody who may set where money goes sets the business's counter UPI ID.
      const set = await request(app)
        .patch(url('/payment-account/counter'))
        .set(auth(ownerToken))
        .send({ upiId: 'SyncTea@okaxis', upiName: null });
      expect(set.statusCode).toBe(200);
      expect(set.body.counter.upiId).toBe('synctea@okaxis');

      const phone = await request(app)
        .patch(url(`/branches/${branchAId}`))
        .set(auth(ownerToken))
        .send({ phone: ' 9552250150 ' });
      expect(phone.statusCode).toBe(200);

      const categories = await request(app).get(url('/expense-categories')).set(auth(cashierToken));
      const gas = categories.body.find((category) => category.code === 'GAS');
      const spent = await request(app)
        .post(url('/expenses'))
        .set(auth(cashierToken))
        .send({ branchId: branchAId, categoryId: gas.id, amount: 450 });
      expect(spent.statusCode).toBe(201);

      day = await request(app).get(url(`/branches/${branchAId}/counter-day`)).set(auth(cashierToken));
      expect(day.body.payee).toEqual({ upiId: 'synctea@okaxis', name: `Sync Tea ${RUN_ID}` });
      expect(day.body.receiptHeader.phone).toBe('9552250150');
      expect(Number(day.body.expenses.totalAmount)).toBe(450);
      expect(day.body.byPaymentMethod.some((row) => row.paymentMethod === 'UPI')).toBe(true);
    });

    it('lets a shop collect into its own UPI ID, and clearing it falls back to the business', async () => {
      const own = await request(app)
        .patch(url(`/branches/${branchAId}/payment-account/counter`))
        .set(auth(ownerToken))
        .send({ upiId: 'franchisee@ybl', upiName: 'Sync Franchisee' });
      expect(own.statusCode).toBe(200);
      let day = await request(app).get(url(`/branches/${branchAId}/counter-day`)).set(auth(cashierToken));
      expect(day.body.payee).toEqual({ upiId: 'franchisee@ybl', name: 'Sync Franchisee' });

      await request(app)
        .patch(url(`/branches/${branchAId}/payment-account/counter`))
        .set(auth(ownerToken))
        .send({ upiId: null });
      day = await request(app).get(url(`/branches/${branchAId}/counter-day`)).set(auth(cashierToken));
      expect(day.body.payee.upiId).toBe('synctea@okaxis');
    });

    it('keeps where money goes away from the cashier and from branch settings', async () => {
      const cashier = await request(app)
        .patch(url('/payment-account/counter'))
        .set(auth(cashierToken))
        .send({ upiId: 'me@okaxis' });
      expect(cashier.statusCode).toBe(403);

      const sideDoor = await request(app)
        .patch(url(`/branches/${branchBId}`))
        .set(auth(ownerToken))
        .send({ phone: '020-1234567', counterUpiId: 'sneaky@okaxis' });
      expect(sideDoor.statusCode).toBe(200);
      const branch = await prisma.branch.findUnique({ where: { id: branchBId } });
      expect(branch.phone).toBe('020-1234567');
      expect(branch.counterUpiId).toBeNull();
    });

    it('lets a Starter owner set the counter’s UPI ID', async () => {
      await onPlan('STARTER');
      const res = await request(app)
        .patch(url('/payment-account/counter'))
        .set(auth(ownerToken))
        .send({ upiId: 'starter@okaxis' });
      expect(res.statusCode).toBe(200);
      await onPlan('FRANCHISE');
    });
  });

  describe('a plan that has run out', () => {
    it('refuses the sync, so the phone keeps the bills until the plan is renewed', async () => {
      await onPlan('GROWTH', { currentPeriodEnd: new Date(Date.now() - (GRACE_DAYS + 1) * DAY) });
      const res = await sync([sale({ deviceTokenNumber: 151 })]);
      expect(res.statusCode).toBe(402);
      expect(res.body.code).toBe('SUBSCRIPTION_READ_ONLY');
      await onPlan('FRANCHISE');
    });
  });
});
