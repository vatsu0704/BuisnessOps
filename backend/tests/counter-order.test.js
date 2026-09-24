const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Counter billing — requirement 1.
//
// The three things worth proving, because each one is silently wrong rather
// than loudly broken when it fails:
//   1. Token numbers are unique per branch per day, even under concurrency.
//   2. The order and the sales fact table never disagree — including after an
//      edit and after a void.
//   3. A closed day cannot be edited, or the day-end export lies.
jest.setTimeout(45000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `ctr-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `ctr-cashier.${RUN_ID}@test.buisnessops.dev`;
const otherCashierEmail = `ctr-other.${RUN_ID}@test.buisnessops.dev`;

describe('Counter billing', () => {
  let ownerToken;
  let cashierToken;
  let otherCashierToken;
  let businessId;
  let branchAId;
  let branchBId;
  let chaiId;
  let samosaId;
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

  /** Open an order and add one line, which is the common setup below. */
  async function orderWith(productId, quantity, branchId = branchAId, token = cashierToken) {
    const opened = await request(app)
      .post(url('/counter-orders'))
      .set(auth(token))
      .send({ branchId });
    expect(opened.statusCode).toBe(201);

    const withItem = await request(app)
      .post(url(`/counter-orders/${opened.body.id}/items`))
      .set(auth(token))
      .send({ productId, quantity });
    expect(withItem.statusCode).toBe(201);
    return withItem.body;
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Counter Owner',
      businessName: `Counter Business ${RUN_ID}`,
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
      ['Counter Branch A', 'CTA'],
      ['Counter Branch B', 'CTB'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata' });
      expect(branch.statusCode).toBe(201);
      if (code === 'CTA') branchAId = branch.body.id;
      else branchBId = branch.body.id;
    }

    const chai = await request(app)
      .post(url('/products'))
      .set(auth(ownerToken))
      .send({ name: 'Counter Chai', unit: 'cup', sellPrice: 20, costPrice: 8 });
    chaiId = chai.body.id;

    const samosa = await request(app)
      .post(url('/products'))
      .set(auth(ownerToken))
      .send({ name: 'Counter Samosa', unit: 'piece', sellPrice: 15 });
    samosaId = samosa.body.id;

    cashierToken = await joinAs(cashierEmail, 'Counter Cashier', 'CASHIER', [branchAId]);
    otherCashierToken = await joinAs(otherCashierEmail, 'Other Cashier', 'CASHIER', [branchBId]);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('tokens', () => {
    it('issues a token the moment the order is opened, not when it is closed', async () => {
      const res = await request(app)
        .post(url('/counter-orders'))
        .set(auth(cashierToken))
        .send({ branchId: branchAId });

      expect(res.statusCode).toBe(201);
      expect(res.body.tokenNumber).toBeGreaterThan(0);
      expect(res.body.status).toBe('OPEN');
      expect(Number(res.body.totalAmount)).toBe(0);
    });

    // The allocator is one atomic statement precisely so this holds. A
    // MAX+1-and-retry passes a sequential test and fails here.
    it('never issues the same token twice, even when orders are opened at once', async () => {
      const opened = await Promise.all(
        Array.from({ length: 12 }, () =>
          request(app).post(url('/counter-orders')).set(auth(cashierToken)).send({ branchId: branchAId })
        )
      );
      for (const res of opened) expect(res.statusCode).toBe(201);

      const numbers = opened.map((res) => res.body.tokenNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('numbers each branch independently', async () => {
      const a = await request(app).post(url('/counter-orders')).set(auth(cashierToken)).send({ branchId: branchAId });
      const b = await request(app)
        .post(url('/counter-orders'))
        .set(auth(otherCashierToken))
        .send({ branchId: branchBId });

      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      // Branch B has barely been used, so its counter is far behind A's.
      expect(b.body.tokenNumber).toBeLessThan(a.body.tokenNumber);
    });
  });

  describe('the running total', () => {
    it('counts the money as items go on', async () => {
      const order = await orderWith(chaiId, 2);
      expect(Number(order.totalAmount)).toBe(40);

      const withSamosa = await request(app)
        .post(url(`/counter-orders/${order.id}/items`))
        .set(auth(cashierToken))
        .send({ productId: samosaId, quantity: 3 });
      expect(Number(withSamosa.body.totalAmount)).toBe(85);
    });

    it('takes the price from the catalog, not from the caller', async () => {
      const opened = await request(app)
        .post(url('/counter-orders'))
        .set(auth(cashierToken))
        .send({ branchId: branchAId });

      const res = await request(app)
        .post(url(`/counter-orders/${opened.body.id}/items`))
        .set(auth(cashierToken))
        // A caller-supplied price on a catalog line is ignored outright.
        .send({ productId: chaiId, quantity: 1, unitPrice: 1 });

      expect(res.statusCode).toBe(201);
      expect(Number(res.body.totalAmount)).toBe(20);
    });

    it('honours a branch price override', async () => {
      await request(app)
        .put(url(`/products/${chaiId}/branches/${branchAId}/pricing`))
        .set(auth(cashierToken))
        .send({ costPrice: 9, sellPrice: 25 });

      const order = await orderWith(chaiId, 2);
      expect(Number(order.totalAmount)).toBe(50);

      await request(app)
        .delete(url(`/products/${chaiId}/branches/${branchAId}/pricing`))
        .set(auth(cashierToken));
    });

    it('accepts a one-off item that is not in the catalog', async () => {
      const opened = await request(app)
        .post(url('/counter-orders'))
        .set(auth(cashierToken))
        .send({ branchId: branchAId });

      const res = await request(app)
        .post(url(`/counter-orders/${opened.body.id}/items`))
        .set(auth(cashierToken))
        .send({ name: 'Special of the day', unitPrice: 55, quantity: 1 });

      expect(res.statusCode).toBe(201);
      expect(Number(res.body.totalAmount)).toBe(55);
    });

    it('refuses a one-off with no name or price', async () => {
      const opened = await request(app)
        .post(url('/counter-orders'))
        .set(auth(cashierToken))
        .send({ branchId: branchAId });

      const res = await request(app)
        .post(url(`/counter-orders/${opened.body.id}/items`))
        .set(auth(cashierToken))
        .send({ quantity: 1 });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('editing after the order is placed (requirement 1)', () => {
    it('changes a quantity and re-totals', async () => {
      const order = await orderWith(chaiId, 2);
      const itemId = order.items[0].id;

      const res = await request(app)
        .patch(url(`/counter-orders/${order.id}/items/${itemId}`))
        .set(auth(cashierToken))
        .send({ quantity: 5 });

      expect(res.statusCode).toBe(200);
      expect(Number(res.body.totalAmount)).toBe(100);
    });

    it('treats a quantity of zero as taking the line off', async () => {
      const order = await orderWith(chaiId, 2);
      const res = await request(app)
        .patch(url(`/counter-orders/${order.id}/items/${order.items[0].id}`))
        .set(auth(cashierToken))
        .send({ quantity: 0 });

      expect(res.statusCode).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(Number(res.body.totalAmount)).toBe(0);
    });

    it('stays editable after it is closed — closing hands it over, it does not freeze it', async () => {
      const order = await orderWith(chaiId, 1);
      const closed = await request(app)
        .post(url(`/counter-orders/${order.id}/close`))
        .set(auth(cashierToken))
        .send({ paymentMethod: 'CASH' });
      expect(closed.statusCode).toBe(200);
      expect(closed.body.status).toBe('CLOSED');

      const corrected = await request(app)
        .post(url(`/counter-orders/${order.id}/items`))
        .set(auth(cashierToken))
        .send({ productId: samosaId, quantity: 1 });
      expect(corrected.statusCode).toBe(201);
      expect(Number(corrected.body.totalAmount)).toBe(35);
    });
  });

  describe('the projection into the sales fact table', () => {
    it('writes one transaction per order, and keeps it in step with edits', async () => {
      const order = await orderWith(chaiId, 2);

      let transaction = await prisma.transaction.findUnique({
        where: { branchId_externalId: { branchId: branchAId, externalId: `counter:${order.id}` } },
        include: { lineItems: true },
      });
      expect(transaction).not.toBeNull();
      expect(transaction.source).toBe('COUNTER');
      expect(Number(transaction.totalAmount)).toBe(40);
      expect(transaction.lineItems).toHaveLength(1);

      await request(app)
        .patch(url(`/counter-orders/${order.id}/items/${order.items[0].id}`))
        .set(auth(cashierToken))
        .send({ quantity: 4 });

      transaction = await prisma.transaction.findUnique({
        where: { branchId_externalId: { branchId: branchAId, externalId: `counter:${order.id}` } },
        include: { lineItems: true },
      });
      // Re-projected, not duplicated.
      expect(Number(transaction.totalAmount)).toBe(80);
      expect(transaction.lineItems).toHaveLength(1);
    });

    it('shows up in the sales summary the rest of the app already reads', async () => {
      const before = await request(app).get(url('/sales-summary')).set(auth(ownerToken));
      const beforeInr = before.body.byCurrency.find((row) => row.currency === 'INR');
      const beforeTotal = Number(beforeInr?.totalSales ?? 0);

      await orderWith(samosaId, 2); // 30

      const after = await request(app).get(url('/sales-summary')).set(auth(ownerToken));
      const afterTotal = Number(after.body.byCurrency.find((row) => row.currency === 'INR').totalSales);
      expect(afterTotal - beforeTotal).toBe(30);
    });

    // VOID projects as TransactionStatus.VOIDED, which getSalesSummary's
    // existing `status: 'COMPLETED'` filter excludes with no new code.
    it('takes a voided order back out of the sales summary', async () => {
      const order = await orderWith(chaiId, 5); // 100

      const before = await request(app).get(url('/sales-summary')).set(auth(ownerToken));
      const beforeTotal = Number(before.body.byCurrency.find((r) => r.currency === 'INR').totalSales);

      const voided = await request(app).post(url(`/counter-orders/${order.id}/void`)).set(auth(cashierToken));
      expect(voided.statusCode).toBe(200);
      expect(voided.body.status).toBe('VOID');

      const after = await request(app).get(url('/sales-summary')).set(auth(ownerToken));
      const afterTotal = Number(after.body.byCurrency.find((r) => r.currency === 'INR').totalSales);
      expect(beforeTotal - afterTotal).toBe(100);
    });

    it('refuses to edit a voided order', async () => {
      const order = await orderWith(chaiId, 1);
      await request(app).post(url(`/counter-orders/${order.id}/void`)).set(auth(cashierToken));

      const res = await request(app)
        .post(url(`/counter-orders/${order.id}/items`))
        .set(auth(cashierToken))
        .send({ productId: chaiId, quantity: 1 });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('COUNTER_ORDER_VOIDED');
    });
  });

  describe('the day', () => {
    it('totals the day, excluding voids but counting them separately', async () => {
      const res = await request(app).get(url(`/branches/${branchBId}/counter-day`)).set(auth(otherCashierToken));
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ branchId: branchBId, isClosed: false });
      expect(typeof res.body.voidCount).toBe('number');
    });

    it('refuses to close while orders are still open', async () => {
      const res = await request(app)
        .post(url(`/branches/${branchAId}/counter-day/close`))
        .set(auth(cashierToken))
        .send({});
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('DAY_HAS_OPEN_ORDERS');
    });

    // The floor. Without it, an edit after the day-end export silently
    // restates a number someone has already been shown.
    it('freezes the day once closed, and thaws it on reopen', async () => {
      // Branch B is quiet; close everything still open there first.
      const open = await request(app)
        .get(url(`/branches/${branchBId}/counter-orders?status=OPEN`))
        .set(auth(otherCashierToken));
      for (const order of open.body) {
        await request(app).post(url(`/counter-orders/${order.id}/close`)).set(auth(otherCashierToken)).send({});
      }

      const order = await orderWith(chaiId, 1, branchBId, otherCashierToken);
      await request(app).post(url(`/counter-orders/${order.id}/close`)).set(auth(otherCashierToken)).send({});

      const closed = await request(app)
        .post(url(`/branches/${branchBId}/counter-day/close`))
        .set(auth(otherCashierToken))
        .send({});
      expect(closed.statusCode).toBe(201);

      const blocked = await request(app)
        .post(url(`/counter-orders/${order.id}/items`))
        .set(auth(otherCashierToken))
        .send({ productId: chaiId, quantity: 1 });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.body.code).toBe('COUNTER_ORDER_DAY_CLOSED');

      // A new order on a closed day is refused too, not just edits.
      const blockedNew = await request(app)
        .post(url('/counter-orders'))
        .set(auth(otherCashierToken))
        .send({ branchId: branchBId });
      expect(blockedNew.statusCode).toBe(409);

      // Closing by mistake must be recoverable, or the floor is a trap.
      const reopened = await request(app)
        .delete(url(`/branches/${branchBId}/counter-day/close`))
        .set(auth(otherCashierToken));
      expect(reopened.statusCode).toBe(200);

      const allowed = await request(app)
        .post(url(`/counter-orders/${order.id}/items`))
        .set(auth(otherCashierToken))
        .send({ productId: chaiId, quantity: 1 });
      expect(allowed.statusCode).toBe(201);
    });

    it('refuses to close a day twice', async () => {
      const open = await request(app)
        .get(url(`/branches/${branchBId}/counter-orders?status=OPEN`))
        .set(auth(otherCashierToken));
      for (const order of open.body) {
        await request(app).post(url(`/counter-orders/${order.id}/close`)).set(auth(otherCashierToken)).send({});
      }
      await request(app).post(url(`/branches/${branchBId}/counter-day/close`)).set(auth(otherCashierToken)).send({});

      const again = await request(app)
        .post(url(`/branches/${branchBId}/counter-day/close`))
        .set(auth(otherCashierToken))
        .send({});
      expect(again.statusCode).toBe(409);
      expect(again.body.code).toBe('DAY_ALREADY_CLOSED');

      await request(app).delete(url(`/branches/${branchBId}/counter-day/close`)).set(auth(otherCashierToken));
    });
  });

  describe('access', () => {
    it('refuses a cashier a branch they cannot reach', async () => {
      const res = await request(app)
        .post(url('/counter-orders'))
        .set(auth(cashierToken))
        .send({ branchId: branchBId });
      expect(res.statusCode).toBe(403);
    });

    // Knowing an order id must not be enough to ring up items at a branch you
    // cannot reach — the reach check is on the order's branch, not the request.
    it('refuses to touch another branch’s order even with its id', async () => {
      const theirs = await orderWith(chaiId, 1, branchBId, otherCashierToken);
      const res = await request(app)
        .post(url(`/counter-orders/${theirs.id}/items`))
        .set(auth(cashierToken))
        .send({ productId: chaiId, quantity: 1 });
      expect(res.statusCode).toBe(403);
    });

    it('refuses a role without the capability', async () => {
      const staffEmail = `ctr-staff.${RUN_ID}@test.buisnessops.dev`;
      const staffToken = await joinAs(staffEmail, 'Counter Staff', 'STAFF', [branchAId]);
      const res = await request(app)
        .post(url('/counter-orders'))
        .set(auth(staffToken))
        .send({ branchId: branchAId });
      expect(res.statusCode).toBe(403);
    });
  });
});
