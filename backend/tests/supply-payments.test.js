const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Task 12 — requirements 24 to 27, end to end.
//
// FOCO and FM branches, third-party vendors, UPI payees, and the accountant who
// pays for the company's branches and confirms what the franchises send. Five
// things here are silently wrong rather than loudly broken when they fail, and
// each has its own block:
//   1. Where money goes can only be changed by the accountant — not the desk
//      that ships the goods.
//   2. A cart with two suppliers becomes two orders with two payees, and a
//      franchise branch's vendor order never reaches the desk.
//   3. A payment is "sent" until the receiver confirms it — except when nobody
//      in the app can (a vendor), when the payer's record is final.
//   4. A company-operated branch pays nothing at the counter, and accounts pays
//      only for what has arrived — one payee per payment, all or nothing.
//   5. The two new pushes reach the accountant and not the owner.
jest.setTimeout(90000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const email = (label) => `pay-${label}.${RUN_ID}@test.buisnessops.dev`;

describe('Paying for supply orders (Task 12)', () => {
  let businessId;
  let ownerToken;
  let ownerUserId;
  let focoBranchId;
  let fmBranchId;

  const people = {};
  let masalaId;
  let waterId;
  let iceId;
  let waterVendorId;
  let iceVendorId;

  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const url = (suffix) => `/api/businesses/${businessId}${suffix}`;

  async function signup(label) {
    const res = await request(app).post('/api/auth/signup').send({
      email: email(label),
      password,
      name: `Pay ${label}`,
      businessName: `Pay ${label} ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(res.statusCode).toBe(201);
    businessIdsToClean.push(res.body.business.id);
    userIdsToClean.push(res.body.user.id);
    return res.body;
  }

  async function joinAs(label, role, branchIds) {
    const account = await signup(label);
    const membership = await request(app)
      .post(url('/memberships'))
      .set(auth(ownerToken))
      .send({ email: email(label), role, branchIds });
    expect(membership.statusCode).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ email: email(label), password });
    return {
      token: login.body.token,
      membershipId: membership.body.id,
      userId: account.user.id,
      ownBusinessId: account.business.id,
    };
  }

  /** Cart some lines at a branch as its cashier, and return the cart. */
  async function cart(branchId, token, lines) {
    let body;
    for (const [inventoryItemId, quantity] of lines) {
      const res = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(token))
        .send({ branchId, inventoryItemId, quantity });
      expect(res.statusCode).toBe(201);
      body = res.body;
    }
    return body;
  }

  async function place(cartId, token, payment) {
    return request(app).post(url(`/supply-orders/${cartId}/place`)).set(auth(token)).send(payment);
  }

  /** Walk a warehouse order to DISPATCHED at the desk. */
  async function dispatch(orderId) {
    for (const step of ['accept', 'pack', 'dispatch']) {
      const res = await request(app)
        .post(url(`/supply-orders/${orderId}/${step}`))
        .set(auth(people.desk.token))
        .send({});
      expect(res.statusCode).toBe(200);
    }
  }

  const notificationsFor = (userId, code) =>
    prisma.notification.findMany({ where: { businessId, userId, code } });

  beforeAll(async () => {
    const owner = await signup('owner');
    ownerToken = owner.token;
    ownerUserId = owner.user.id;
    businessId = owner.business.id;

    // A company-operated shop and a franchise, which is the whole of
    // requirement 24: same app, two answers to "who pays?".
    const foco = await request(app)
      .post(url('/branches'))
      .set(auth(ownerToken))
      .send({ name: 'Ring Road', code: 'RR', timezone: 'Asia/Kolkata', operatingModel: 'FOCO' });
    expect(foco.statusCode).toBe(201);
    expect(foco.body.operatingModel).toBe('FOCO');
    focoBranchId = foco.body.id;

    const fm = await request(app)
      .post(url('/branches'))
      .set(auth(ownerToken))
      .send({ name: 'Franchise Adajan', code: 'FA', timezone: 'Asia/Kolkata' });
    expect(fm.statusCode).toBe(201);
    // Not asked is FM — the flow every branch had before there was a choice.
    expect(fm.body.operatingModel).toBe('FM');
    fmBranchId = fm.body.id;

    people.focoCashier = await joinAs('foco-cashier', 'CASHIER', [focoBranchId]);
    people.fmCashier = await joinAs('fm-cashier', 'CASHIER', [fmBranchId]);
    people.desk = await joinAs('desk', 'WAREHOUSE', []);
    people.agent = await joinAs('agent', 'DELIVERY_AGENT', []);
    people.accountant = await joinAs('accountant', 'ACCOUNTANT', []);

    // The desk runs the catalog, so the desk adds suppliers.
    const water = await request(app)
      .post(url('/vendors'))
      .set(auth(people.desk.token))
      .send({ name: 'Shree Water', phone: '+91 98765 43210' });
    expect(water.statusCode).toBe(201);
    waterVendorId = water.body.id;

    const ice = await request(app).post(url('/vendors')).set(auth(people.desk.token)).send({ name: 'Cool Ice' });
    expect(ice.statusCode).toBe(201);
    iceVendorId = ice.body.id;

    const masala = await request(app)
      .post(url('/supply-items'))
      .set(auth(ownerToken))
      .send({ name: 'Chai masala', unit: 'kg', unitPrice: 400 });
    masalaId = masala.body.id;
    expect(masala.body.vendorId).toBeNull();

    const waterItem = await request(app)
      .post(url('/supply-items'))
      .set(auth(ownerToken))
      .send({ name: 'Water can', unit: 'can', unitPrice: 30, vendorId: waterVendorId });
    expect(waterItem.statusCode).toBe(201);
    expect(waterItem.body.vendor.name).toBe('Shree Water');
    waterId = waterItem.body.id;

    const iceItem = await request(app)
      .post(url('/supply-items'))
      .set(auth(ownerToken))
      .send({ name: 'Ice block', unit: 'block', unitPrice: 50, vendorId: iceVendorId });
    iceId = iceItem.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  // --- 1. Where money goes ----------------------------------------------------

  describe('payees', () => {
    it('lets the accountant set the warehouse UPI ID, and records who and when', async () => {
      const res = await request(app)
        .patch(url('/payment-account'))
        .set(auth(people.accountant.token))
        .send({ upiId: '  HisabWarehouse@OKAXIS ', upiName: 'HisabKitab Warehouse' });
      expect(res.statusCode).toBe(200);
      // Lower-cased and trimmed, so "is this the same ID?" is a comparison.
      expect(res.body.upiId).toBe('hisabwarehouse@okaxis');
      expect(res.body.upiUpdatedByMembership.id).toBe(people.accountant.membershipId);
      expect(res.body.upiUpdatedAt).toBeTruthy();
    });

    // The point of `paymentAccount:manage`: whoever can change where money goes
    // must not also be whoever ships the goods.
    it('refuses the warehouse desk any change to where money goes', async () => {
      const own = await request(app)
        .patch(url('/payment-account'))
        .set(auth(people.desk.token))
        .send({ upiId: 'desk@ybl' });
      expect(own.statusCode).toBe(403);

      const vendor = await request(app)
        .patch(url(`/vendors/${waterVendorId}/upi`))
        .set(auth(people.desk.token))
        .send({ upiId: 'desk@ybl' });
      expect(vendor.statusCode).toBe(403);

      // And a UPI ID riding along on the desk's own vendor edit is not written.
      const sneak = await request(app)
        .patch(url(`/vendors/${waterVendorId}`))
        .set(auth(people.desk.token))
        .send({ phone: '+91 98765 43210', upiId: 'desk@ybl' });
      expect(sneak.statusCode).toBe(200);
      expect(sneak.body.upiId).not.toBe('desk@ybl');
    });

    it('lets the accountant set a vendor’s UPI ID, and refuses one that is not a UPI ID', async () => {
      const bad = await request(app)
        .patch(url(`/vendors/${waterVendorId}/upi`))
        .set(auth(people.accountant.token))
        .send({ upiId: 'not a upi id' });
      expect(bad.statusCode).toBe(400);
      expect(bad.body.details[0].code).toBe('UPI_ID_INVALID');

      const res = await request(app)
        .patch(url(`/vendors/${waterVendorId}/upi`))
        .set(auth(people.accountant.token))
        .send({ upiId: 'shreewater@ybl', upiName: 'Shree Water Suppliers' });
      expect(res.statusCode).toBe(200);
      expect(res.body.upiId).toBe('shreewater@ybl');
      expect(res.body.upiUpdatedByMembership.id).toBe(people.accountant.membershipId);
    });

    it('treats vendor names case-insensitively', async () => {
      const res = await request(app).post(url('/vendors')).set(auth(people.desk.token)).send({ name: 'shree WATER' });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('VENDOR_NAME_TAKEN');
    });

    it('keeps vendors to their own business', async () => {
      // The accountant owns a solo business of their own from signing up.
      const elsewhere = await request(app)
        .post(`/api/businesses/${people.accountant.ownBusinessId}/vendors`)
        .set(auth(people.accountant.token))
        .send({ name: 'Elsewhere Supplies' });
      expect(elsewhere.statusCode).toBe(201);

      const res = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: 'Borrowed thing', unit: 'kg', unitPrice: 1, vendorId: elsewhere.body.id });
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('VENDOR_NOT_FOUND');
    });

    it('refuses to order from a vendor that has been withdrawn', async () => {
      const off = await request(app)
        .patch(url(`/vendors/${iceVendorId}`))
        .set(auth(people.desk.token))
        .send({ isActive: false });
      expect(off.statusCode).toBe(200);

      const res = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(people.fmCashier.token))
        .send({ branchId: fmBranchId, inventoryItemId: iceId, quantity: 1 });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('SUPPLY_VENDOR_INACTIVE');

      await request(app).patch(url(`/vendors/${iceVendorId}`)).set(auth(people.desk.token)).send({ isActive: true });
    });

    it('validates and updates a branch’s operating model', async () => {
      const bad = await request(app)
        .patch(url(`/branches/${fmBranchId}`))
        .set(auth(ownerToken))
        .send({ operatingModel: 'SOMETHING' });
      expect(bad.statusCode).toBe(400);

      const cashierTries = await request(app)
        .patch(url(`/branches/${fmBranchId}`))
        .set(auth(people.fmCashier.token))
        .send({ operatingModel: 'FOCO' });
      expect(cashierTries.statusCode).toBe(403);
    });
  });

  // --- 2 and 3. A franchise branch pays for itself --------------------------

  describe('an FM branch', () => {
    it('splits a mixed cart into one order per supplier', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [
        [masalaId, 2],
        [waterId, 10],
      ]);
      const res = await place(draft.id, people.fmCashier.token, { paymentMode: 'COD' });
      expect(res.statusCode).toBe(200);

      // The warehouse first, on the cart's own row; the vendor on a new one.
      expect(res.body.id).toBe(draft.id);
      expect(res.body.vendorId).toBeNull();
      expect(res.body.placedOrders).toHaveLength(2);
      const [warehouse, vendor] = res.body.placedOrders;
      expect(vendor.vendorName).toBe('Shree Water');
      expect(warehouse.orderNumber).not.toBe(vendor.orderNumber);
      expect(Number(warehouse.totalAmount)).toBe(800);
      expect(Number(vendor.totalAmount)).toBe(300);

      const rows = await prisma.supplyOrder.findMany({
        where: { id: { in: [warehouse.id, vendor.id] } },
        include: { items: true },
      });
      expect(new Set(rows.map((row) => row.placementId)).size).toBe(1);
      for (const row of rows) {
        expect(row.operatingModel).toBe('FM');
        expect(row.paymentMode).toBe('COD');
        expect(row.paymentStatus).toBe('PENDING');
        expect(row.items).toHaveLength(1);
      }

      // The desk sees the warehouse order and not the vendor's — a franchise
      // branch orders from its vendor itself.
      const desk = await request(app).get(url('/supply-desk')).set(auth(people.desk.token));
      const deskIds = desk.body.map((order) => order.id);
      expect(deskIds).toContain(warehouse.id);
      expect(deskIds).not.toContain(vendor.id);
    });

    it('needs to know how it is paying, and that it has paid', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [[masalaId, 1]]);

      const none = await place(draft.id, people.fmCashier.token, {});
      expect(none.statusCode).toBe(400);
      expect(none.body.code).toBe('SUPPLY_ORDER_PAYMENT_MODE_REQUIRED');

      const unconfirmed = await place(draft.id, people.fmCashier.token, { paymentMode: 'ONLINE' });
      expect(unconfirmed.statusCode).toBe(400);
      expect(unconfirmed.body.details[0].code).toBe('PAYMENT_NOT_CONFIRMED');

      // Nothing was placed by either refusal: it is still the branch's cart.
      const still = await prisma.supplyOrder.findUnique({ where: { id: draft.id } });
      expect(still.status).toBe('DRAFT');
    });

    it('refuses to pay now a payee with no UPI ID, and places nothing', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [
        [masalaId, 1],
        [iceId, 1],
      ]);
      const res = await place(draft.id, people.fmCashier.token, { paymentMode: 'ONLINE', paymentConfirmed: true });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('SUPPLY_PAYEE_NOT_SET');
      expect(res.body.params.payee).toBe('Cool Ice');

      const still = await prisma.supplyOrder.findUnique({ where: { id: draft.id }, include: { items: true } });
      expect(still.status).toBe('DRAFT');
      expect(still.items).toHaveLength(2);

      // Paying on delivery needs no QR, so the same cart goes through that way.
      const cod = await place(draft.id, people.fmCashier.token, { paymentMode: 'COD' });
      expect(cod.statusCode).toBe(200);
      expect(cod.body.placedOrders).toHaveLength(2);
    });

    // Requirement 26's rule: confirmed by the receiver when the receiver uses
    // the app, final at once when it is a vendor who never will.
    it('pays now: the warehouse is sent money, the vendor is simply paid', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [
        [masalaId, 1],
        [waterId, 2],
      ]);
      const res = await place(draft.id, people.fmCashier.token, { paymentMode: 'ONLINE', paymentConfirmed: true });
      expect(res.statusCode).toBe(200);
      const [warehouse, vendor] = res.body.placedOrders;
      expect(warehouse.paymentStatus).toBe('PAID');
      expect(vendor.paymentStatus).toBe('VERIFIED');
      expect(res.body.events.some((event) => event.reasonCode === 'PAYMENT_CLAIMED')).toBe(true);

      // The accountant is told there is money to look for; the desk, which
      // already heard about the order itself, and the owner are not.
      expect((await notificationsFor(people.accountant.userId, 'SUPPLY_PAYMENT_SENT')).length).toBeGreaterThan(0);
      expect(await notificationsFor(people.desk.userId, 'SUPPLY_PAYMENT_SENT')).toHaveLength(0);
      expect(await notificationsFor(ownerUserId, 'SUPPLY_PAYMENT_SENT')).toHaveLength(0);

      // It is waiting to be confirmed, and only the warehouse order is.
      const toConfirm = await request(app).get(url('/supply-payments/to-confirm')).set(auth(people.accountant.token));
      expect(toConfirm.statusCode).toBe(200);
      const ids = toConfirm.body.map((order) => order.id);
      expect(ids).toContain(warehouse.id);
      expect(ids).not.toContain(vendor.id);
      // A list of payments, not of timelines.
      expect(toConfirm.body[0].events).toBeUndefined();

      const received = await request(app)
        .post(url(`/supply-orders/${warehouse.id}/verify-payment`))
        .set(auth(people.accountant.token))
        .send({ outcome: 'VERIFIED' });
      expect(received.statusCode).toBe(200);
      expect(received.body.paymentStatus).toBe('VERIFIED');

      // A vendor's money never came to the warehouse, so there is nothing to
      // confirm on it.
      const vendorConfirm = await request(app)
        .post(url(`/supply-orders/${vendor.id}/verify-payment`))
        .set(auth(people.accountant.token))
        .send({ outcome: 'VERIFIED' });
      expect(vendorConfirm.statusCode).toBe(409);
      expect(vendorConfirm.body.code).toBe('SUPPLY_ORDER_VENDOR_ORDER');
    });

    it('lets the agent take it by UPI at the counter, and the branch pay again if it never arrived', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [[masalaId, 3]]);
      const placed = await place(draft.id, people.fmCashier.token, { paymentMode: 'COD' });
      await dispatch(placed.body.id);

      const unasked = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/deliver`))
        .set(auth(people.agent.token))
        .send({});
      expect(unasked.statusCode).toBe(400);
      expect(unasked.body.code).toBe('SUPPLY_ORDER_CASH_NOT_CONFIRMED');

      const delivered = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/deliver`))
        .set(auth(people.agent.token))
        .send({ collectedVia: 'UPI' });
      expect(delivered.statusCode).toBe(200);
      expect(delivered.body.status).toBe('DELIVERED');
      expect(delivered.body.paymentStatus).toBe('PAID');
      expect(delivered.body.events.some((event) => event.reasonCode === 'PAYMENT_COLLECTED_UPI')).toBe(true);

      const notReceived = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/verify-payment`))
        .set(auth(people.desk.token))
        .send({ outcome: 'FAILED' });
      expect(notReceived.body.paymentStatus).toBe('FAILED');

      // Cash for the warehouse goes through the agent, never claimed from here.
      const cash = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/pay`))
        .set(auth(people.fmCashier.token))
        .send({ method: 'CASH' });
      expect(cash.statusCode).toBe(400);
      expect(cash.body.code).toBe('SUPPLY_ORDER_CASH_NEEDS_AGENT');

      const again = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/pay`))
        .set(auth(people.fmCashier.token))
        .send({ method: 'UPI' });
      expect(again.statusCode).toBe(200);
      expect(again.body.paymentStatus).toBe('PAID');

      // And a double tap is one payment, not a second claim.
      const twice = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/pay`))
        .set(auth(people.fmCashier.token))
        .send({ method: 'UPI' });
      expect(twice.statusCode).toBe(409);
      expect(twice.body.code).toBe('SUPPLY_ORDER_PAYMENT_NOT_OPEN');
    });

    it('still accepts the cash answer an older app sends', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [[masalaId, 1]]);
      const placed = await place(draft.id, people.fmCashier.token, { paymentMode: 'COD' });
      await dispatch(placed.body.id);
      const res = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/deliver`))
        .set(auth(people.agent.token))
        .send({ cashCollected: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.events.some((event) => event.reasonCode === 'PAYMENT_COLLECTED')).toBe(true);
    });

    it('receives a vendor’s goods at the branch, asking whether the vendor was paid', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [[waterId, 4]]);
      const placed = await place(draft.id, people.fmCashier.token, { paymentMode: 'COD' });
      const orderId = placed.body.id;
      expect(placed.body.vendorId).toBe(waterVendorId);

      // None of the warehouse's own verbs apply to a vendor's goods.
      const pack = await request(app)
        .post(url(`/supply-orders/${orderId}/pack`))
        .set(auth(people.desk.token))
        .send({});
      expect(pack.statusCode).toBe(409);
      const agentDeliver = await request(app)
        .post(url(`/supply-orders/${orderId}/deliver`))
        .set(auth(people.agent.token))
        .send({ collectedVia: 'CASH' });
      expect(agentDeliver.statusCode).toBe(409);
      expect(agentDeliver.body.code).toBe('SUPPLY_ORDER_VENDOR_ORDER');

      const unanswered = await request(app)
        .post(url(`/supply-orders/${orderId}/receive`))
        .set(auth(people.fmCashier.token))
        .send({});
      expect(unanswered.statusCode).toBe(400);
      expect(unanswered.body.code).toBe('SUPPLY_ORDER_VENDOR_PAYMENT_UNANSWERED');

      const received = await request(app)
        .post(url(`/supply-orders/${orderId}/receive`))
        .set(auth(people.fmCashier.token))
        .send({ vendorPaid: 'NOT_YET' });
      expect(received.statusCode).toBe(200);
      expect(received.body.status).toBe('DELIVERED');
      expect(received.body.paymentStatus).toBe('PENDING');

      // Paying the vendor later is final at once — nobody else could confirm it.
      const paid = await request(app)
        .post(url(`/supply-orders/${orderId}/pay`))
        .set(auth(people.fmCashier.token))
        .send({ method: 'CASH' });
      expect(paid.statusCode).toBe(200);
      expect(paid.body.paymentStatus).toBe('VERIFIED');
      expect(paid.body.events.some((event) => event.reasonCode === 'PAYMENT_PAID_VENDOR_CASH')).toBe(true);
    });

    it('does not let the branch "receive" a warehouse order', async () => {
      const draft = await cart(fmBranchId, people.fmCashier.token, [[masalaId, 1]]);
      const placed = await place(draft.id, people.fmCashier.token, { paymentMode: 'COD' });
      const res = await request(app)
        .post(url(`/supply-orders/${placed.body.id}/receive`))
        .set(auth(people.fmCashier.token))
        .send({ vendorPaid: 'CASH' });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ORDER_NOT_VENDOR_ORDER');
    });
  });

  // --- 4 and 5. A company-operated branch, and accounts paying for it --------

  describe('a FOCO branch', () => {
    let warehouseOrderId;
    let vendorOrderId;

    it('places with no payment question — accounts pays, whatever a client sends', async () => {
      const draft = await cart(focoBranchId, people.focoCashier.token, [
        [masalaId, 2],
        [waterId, 5],
      ]);
      // An app build from before requirement 24 still sends a mode. The
      // branch's model is the authority, not the button.
      const res = await place(draft.id, people.focoCashier.token, { paymentMode: 'COD' });
      expect(res.statusCode).toBe(200);
      [warehouseOrderId, vendorOrderId] = res.body.placedOrders.map((order) => order.id);

      const rows = await prisma.supplyOrder.findMany({ where: { id: { in: [warehouseOrderId, vendorOrderId] } } });
      for (const row of rows) {
        expect(row.operatingModel).toBe('FOCO');
        expect(row.paymentMode).toBe('ACCOUNTS');
        expect(row.paymentStatus).toBe('PENDING');
      }
      expect(res.body.events.some((event) => event.reasonCode === 'PAYMENT_BY_ACCOUNTS')).toBe(true);
    });

    it('sends a FOCO vendor order through the desk, which forwards it', async () => {
      const desk = await request(app).get(url('/supply-desk')).set(auth(people.desk.token));
      expect(desk.body.map((order) => order.id)).toContain(vendorOrderId);

      const sent = await request(app)
        .post(url(`/supply-orders/${vendorOrderId}/accept`))
        .set(auth(people.desk.token))
        .send({});
      expect(sent.statusCode).toBe(200);
      expect(sent.body.status).toBe('ACCEPTED');

      // The branch is told it went to the vendor — not that the warehouse took it.
      expect(
        (await notificationsFor(people.focoCashier.userId, 'SUPPLY_ORDER_SENT_TO_VENDOR')).length
      ).toBeGreaterThan(0);

      // And no agent of ours can be given it.
      const assign = await request(app)
        .post(url(`/supply-orders/${vendorOrderId}/assign`))
        .set(auth(people.desk.token))
        .send({ deliveryAgentMembershipId: people.agent.membershipId });
      expect(assign.statusCode).toBe(409);
      expect(assign.body.code).toBe('SUPPLY_ORDER_VENDOR_ORDER');
    });

    it('shows accounts the order at once, and refuses to pay for it before it arrives', async () => {
      const due = await request(app).get(url('/supply-payments/due')).set(auth(people.accountant.token));
      expect(due.statusCode).toBe(200);
      const ids = due.body.map((order) => order.id);
      expect(ids).toContain(warehouseOrderId);
      expect(ids).toContain(vendorOrderId);

      const early = await request(app)
        .post(url('/supply-payments/settle'))
        .set(auth(people.accountant.token))
        .send({ supplyOrderIds: [warehouseOrderId] });
      expect(early.statusCode).toBe(409);
      expect(early.body.code).toBe('SUPPLY_PAYMENT_NOT_DELIVERED');
    });

    it('is delivered with nothing asked, and tells the accountant it can be paid for', async () => {
      await dispatch(warehouseOrderId);
      const delivered = await request(app)
        .post(url(`/supply-orders/${warehouseOrderId}/deliver`))
        .set(auth(people.agent.token))
        .send({});
      expect(delivered.statusCode).toBe(200);
      expect(delivered.body.status).toBe('DELIVERED');
      expect(delivered.body.paymentStatus).toBe('PENDING');

      const received = await request(app)
        .post(url(`/supply-orders/${vendorOrderId}/receive`))
        .set(auth(people.focoCashier.token))
        .send({});
      expect(received.statusCode).toBe(200);

      const ready = await notificationsFor(people.accountant.userId, 'SUPPLY_ORDER_READY_TO_PAY');
      expect(ready.length).toBe(2);
      expect(ready[0].deepLink).toEqual({ route: 'SupplyPayments', params: {} });
      // Not the owner, who holds every capability and would be woken by each.
      expect(await notificationsFor(ownerUserId, 'SUPPLY_ORDER_READY_TO_PAY')).toHaveLength(0);
    });

    it('is never the branch’s to pay or the desk’s to confirm', async () => {
      const pay = await request(app)
        .post(url(`/supply-orders/${warehouseOrderId}/pay`))
        .set(auth(people.focoCashier.token))
        .send({ method: 'UPI' });
      expect(pay.statusCode).toBe(409);
      expect(pay.body.code).toBe('SUPPLY_ORDER_SETTLED_BY_ACCOUNTS');

      const confirm = await request(app)
        .post(url(`/supply-orders/${warehouseOrderId}/verify-payment`))
        .set(auth(people.desk.token))
        .send({ outcome: 'FAILED' });
      expect(confirm.statusCode).toBe(409);

      for (const who of [people.focoCashier, people.desk]) {
        const settle = await request(app)
          .post(url('/supply-payments/settle'))
          .set(auth(who.token))
          .send({ supplyOrderIds: [warehouseOrderId] });
        expect(settle.statusCode).toBe(403);
      }
    });

    // One QR pays one UPI ID. A batch across payees is refused whole, so a
    // payment of one total never records itself against a different one.
    it('pays one payee at a time, all or nothing', async () => {
      const mixed = await request(app)
        .post(url('/supply-payments/settle'))
        .set(auth(people.accountant.token))
        .send({ supplyOrderIds: [warehouseOrderId, vendorOrderId] });
      expect(mixed.statusCode).toBe(409);
      expect(mixed.body.code).toBe('SUPPLY_PAYMENT_MIXED_PAYEES');
      const untouched = await prisma.supplyOrder.findMany({ where: { id: { in: [warehouseOrderId, vendorOrderId] } } });
      expect(untouched.every((row) => row.paymentStatus === 'PENDING')).toBe(true);

      const paid = await request(app)
        .post(url('/supply-payments/settle'))
        .set(auth(people.accountant.token))
        .send({ supplyOrderIds: [warehouseOrderId] });
      expect(paid.statusCode).toBe(200);
      expect(paid.body.count).toBe(1);
      expect(Number(paid.body.totalAmount)).toBe(800);

      const row = await prisma.supplyOrder.findUnique({
        where: { id: warehouseOrderId },
        include: { events: true },
      });
      expect(row.paymentStatus).toBe('VERIFIED');
      expect(row.events.some((event) => event.reasonCode === 'PAYMENT_SETTLED')).toBe(true);

      const twice = await request(app)
        .post(url('/supply-payments/settle'))
        .set(auth(people.accountant.token))
        .send({ supplyOrderIds: [warehouseOrderId] });
      expect(twice.statusCode).toBe(409);
      expect(twice.body.code).toBe('SUPPLY_PAYMENT_NOT_DUE');

      const due = await request(app).get(url('/supply-payments/due')).set(auth(people.accountant.token));
      expect(due.body.map((order) => order.id)).not.toContain(warehouseOrderId);
    });

    it('keeps an order placed as FOCO a FOCO order after the branch changes model', async () => {
      const moved = await request(app)
        .patch(url(`/branches/${focoBranchId}`))
        .set(auth(ownerToken))
        .send({ operatingModel: 'FM' });
      expect(moved.statusCode).toBe(200);

      const row = await prisma.supplyOrder.findUnique({ where: { id: vendorOrderId } });
      expect(row.operatingModel).toBe('FOCO');
      expect(row.paymentMode).toBe('ACCOUNTS');

      await request(app).patch(url(`/branches/${focoBranchId}`)).set(auth(ownerToken)).send({ operatingModel: 'FOCO' });
    });

    it('refuses a batch that is empty, or too long', async () => {
      const empty = await request(app)
        .post(url('/supply-payments/settle'))
        .set(auth(people.accountant.token))
        .send({ supplyOrderIds: [] });
      expect(empty.statusCode).toBe(400);

      const tooMany = await request(app)
        .post(url('/supply-payments/settle'))
        .set(auth(people.accountant.token))
        .send({ supplyOrderIds: Array.from({ length: 101 }, (_, i) => `id-${i}`) });
      expect(tooMany.statusCode).toBe(400);
    });
  });

  // --- The accountant's reach --------------------------------------------------

  describe('the accountant', () => {
    it('reads every branch’s numbers', async () => {
      const grid = await request(app).get(url('/analytics/branch-monthly')).set(auth(people.accountant.token));
      expect(grid.statusCode).toBe(200);
      expect(grid.body.business).toBeTruthy();
    });

    it('reaches none of the branches’ people, tills or carts, and does not run the desk', async () => {
      const checks = [
        request(app).get(url('/memberships')).set(auth(people.accountant.token)),
        request(app)
          .post(url('/staff'))
          .set(auth(people.accountant.token))
          .send({ name: 'Somebody', branchId: focoBranchId }),
        request(app)
          .post(url('/supply-cart/items'))
          .set(auth(people.accountant.token))
          .send({ branchId: focoBranchId, inventoryItemId: masalaId, quantity: 1 }),
        request(app).get(url('/supply-desk')).set(auth(people.accountant.token)),
        request(app).post(url('/vendors')).set(auth(people.accountant.token)).send({ name: 'Not mine to add' }),
      ];
      for (const res of await Promise.all(checks)) expect(res.statusCode).toBe(403);
    });
  });
});
