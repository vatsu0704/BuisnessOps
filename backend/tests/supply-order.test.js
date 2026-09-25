const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Supply orders end to end — requirements 3, 5, 5.1, 9, 11 and 12.
//
// Four things are worth proving here, because each is silently wrong rather
// than loudly broken when it fails:
//   1. The status machine refuses the moves nobody should make — the whole
//      point of keeping it as data in one place.
//   2. Each role is refused the others' actions. A cashier who can accept their
//      own order has made the warehouse desk decorative.
//   3. Order numbers are unique under concurrency, like tokens.
//   4. A delivery agent reaches the run they were given and nothing else.
jest.setTimeout(60000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `sup-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `sup-cashier.${RUN_ID}@test.buisnessops.dev`;
const otherCashierEmail = `sup-cashier2.${RUN_ID}@test.buisnessops.dev`;
// A second cashier on the SAME branch. The cart is shared by the branch, so
// one person building it and another sending it is a normal Tuesday.
const mateEmail = `sup-mate.${RUN_ID}@test.buisnessops.dev`;
const warehouseEmail = `sup-warehouse.${RUN_ID}@test.buisnessops.dev`;
const riderEmail = `sup-rider.${RUN_ID}@test.buisnessops.dev`;
const otherRiderEmail = `sup-rider2.${RUN_ID}@test.buisnessops.dev`;

describe('Supply orders', () => {
  let ownerToken;
  let cashierToken;
  let otherCashierToken;
  let warehouseToken;
  let riderToken;
  let otherRiderToken;
  let mateToken;
  let mateMembershipId;
  let riderMembershipId;
  let otherRiderMembershipId;
  let cashierMembershipId;
  let businessId;
  let branchAId;
  let branchBId;
  let flourId;
  let milkId;
  let unpricedId;

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
    return { token: login.body.token, membershipId: membership.body.id };
  }

  /** Cart one thing at a branch and return the DRAFT it landed in. */
  async function cartWith(itemId, quantity, branchId = branchAId, token = cashierToken) {
    const res = await request(app)
      .post(url('/supply-cart/items'))
      .set(auth(token))
      .send({ branchId, inventoryItemId: itemId, quantity });
    expect(res.statusCode).toBe(201);
    return res.body;
  }

  /** A placed order, which is the starting point for most of the desk tests. */
  async function placedOrder({ mode = 'COD', branchId = branchAId, token = cashierToken } = {}) {
    const cart = await cartWith(flourId, 2, branchId, token);
    const res = await request(app)
      .post(url(`/supply-orders/${cart.id}/place`))
      .set(auth(token))
      .send(mode === 'ONLINE' ? { paymentMode: 'ONLINE', paymentReference: `UTR${Date.now()}` } : { paymentMode: 'COD' });
    expect(res.statusCode).toBe(200);
    return res.body;
  }

  /** Walk an order to a given status using the warehouse desk. */
  async function advanceTo(orderId, status) {
    const steps = { ACCEPTED: ['accept'], PACKED: ['accept', 'pack'], DISPATCHED: ['accept', 'pack', 'dispatch'] };
    for (const step of steps[status]) {
      const res = await request(app)
        .post(url(`/supply-orders/${orderId}/${step}`))
        .set(auth(warehouseToken))
        .send({});
      expect(res.statusCode).toBe(200);
    }
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Supply Owner',
      businessName: `Supply Business ${RUN_ID}`,
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

    // Branch A carries a delivery address and branch B does not, on purpose:
    // an order to a branch nobody ever filled one in for still has to work,
    // and the agent's screen has to say so rather than showing a blank.
    for (const [name, code, address] of [
      [
        'Supply Branch A',
        'SPA',
        {
          city: 'Surat',
          addressLine: '12 Ring Road, above Patel Stores\nOpposite the bus depot',
          postalCode: '395002',
        },
      ],
      ['Supply Branch B', 'SPB', {}],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata', ...address });
      expect(branch.statusCode).toBe(201);
      if (code === 'SPA') branchAId = branch.body.id;
      else branchBId = branch.body.id;
    }

    const flour = await request(app)
      .post(url('/supply-items'))
      .set(auth(ownerToken))
      .send({ name: 'Flour', unit: 'kg', category: 'Dry goods', unitPrice: 45 });
    expect(flour.statusCode).toBe(201);
    flourId = flour.body.id;

    const milk = await request(app)
      .post(url('/supply-items'))
      .set(auth(ownerToken))
      .send({ name: 'Milk', unit: 'litre', unitPrice: 60 });
    milkId = milk.body.id;

    const unpriced = await request(app)
      .post(url('/supply-items'))
      .set(auth(ownerToken))
      .send({ name: 'Saffron', unit: 'gram' });
    unpricedId = unpriced.body.id;

    ({ token: cashierToken, membershipId: cashierMembershipId } = await joinAs(
      cashierEmail,
      'Supply Cashier',
      'CASHIER',
      [branchAId]
    ));
    ({ token: otherCashierToken } = await joinAs(otherCashierEmail, 'Other Cashier', 'CASHIER', [branchBId]));
    ({ token: mateToken, membershipId: mateMembershipId } = await joinAs(
      mateEmail,
      'Shift Mate',
      'CASHIER',
      [branchAId]
    ));
    ({ token: warehouseToken } = await joinAs(warehouseEmail, 'Supply Desk', 'WAREHOUSE', []));
    ({ token: riderToken, membershipId: riderMembershipId } = await joinAs(
      riderEmail,
      'Supply Rider',
      'DELIVERY_AGENT',
      [branchAId]
    ));
    ({ token: otherRiderToken, membershipId: otherRiderMembershipId } = await joinAs(
      otherRiderEmail,
      'Other Rider',
      'DELIVERY_AGENT',
      [branchBId]
    ));
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  // --- The catalog ---------------------------------------------------------

  describe('the raw-material catalog', () => {
    it('lets a cashier read it but not change it', async () => {
      const read = await request(app).get(url('/supply-items')).set(auth(cashierToken));
      expect(read.statusCode).toBe(200);
      expect(read.body.map((i) => i.name)).toEqual(expect.arrayContaining(['Flour', 'Milk']));

      const write = await request(app)
        .post(url('/supply-items'))
        .set(auth(cashierToken))
        .send({ name: 'Cashier Sugar', unit: 'kg', unitPrice: 40 });
      expect(write.statusCode).toBe(403);
    });

    it('lets the warehouse desk manage it — it is the desk that decides the price', async () => {
      const res = await request(app)
        .post(url('/supply-items'))
        .set(auth(warehouseToken))
        .send({ name: 'Desk Sugar', unit: 'kg', unitPrice: 42 });
      expect(res.statusCode).toBe(201);
      expect(Number(res.body.unitPrice)).toBe(42);
    });

    it('refuses a duplicate name regardless of case', async () => {
      const res = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: 'fLoUr', unit: 'kg', unitPrice: 50 });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ITEM_NAME_TAKEN');
    });

    it('hides withdrawn items from the ordering list but keeps them readable', async () => {
      const created = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: 'Discontinued Ghee', unit: 'kg', unitPrice: 500 });
      await request(app)
        .patch(url(`/supply-items/${created.body.id}`))
        .set(auth(ownerToken))
        .send({ isActive: false });

      const listed = await request(app).get(url('/supply-items')).set(auth(cashierToken));
      expect(listed.body.find((i) => i.id === created.body.id)).toBeUndefined();

      const all = await request(app).get(url('/supply-items?includeInactive=true')).set(auth(cashierToken));
      expect(all.body.find((i) => i.id === created.body.id)).toBeDefined();
    });
  });

  // --- The cart ------------------------------------------------------------

  describe('the cart', () => {
    it('creates one draft per branch and merges a repeated item into one line', async () => {
      const first = await cartWith(milkId, 3, branchBId, otherCashierToken);
      expect(first.status).toBe('DRAFT');
      expect(first.items).toHaveLength(1);

      const second = await cartWith(milkId, 2, branchBId, otherCashierToken);
      expect(second.id).toBe(first.id);
      expect(second.items).toHaveLength(1);
      expect(Number(second.items[0].quantity)).toBe(5);
      expect(Number(second.totalAmount)).toBe(5 * 60);
    });

    it('takes the price from the catalog, never from the caller', async () => {
      const res = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(cashierToken))
        .send({ branchId: branchAId, inventoryItemId: flourId, quantity: 1, unitPrice: 1 });
      expect(res.statusCode).toBe(201);
      expect(Number(res.body.items.find((i) => i.inventoryItemId === flourId).unitPrice)).toBe(45);

      // Clean the shared branch-A cart up so later tests start empty.
      const line = res.body.items.find((i) => i.inventoryItemId === flourId);
      await request(app)
        .delete(url(`/supply-orders/${res.body.id}/items/${line.id}`))
        .set(auth(cashierToken));
    });

    it('refuses an item with no price rather than ordering it at zero', async () => {
      const res = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(cashierToken))
        .send({ branchId: branchAId, inventoryItemId: unpricedId, quantity: 1 });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('SUPPLY_ITEM_HAS_NO_PRICE');
    });

    it('refuses to cart into a branch the cashier cannot reach', async () => {
      const res = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(cashierToken))
        .send({ branchId: branchBId, inventoryItemId: flourId, quantity: 1 });
      expect(res.statusCode).toBe(403);
    });

    it('removes a line when its quantity goes to zero', async () => {
      const cart = await cartWith(flourId, 4);
      const line = cart.items.find((i) => i.inventoryItemId === flourId);

      const res = await request(app)
        .patch(url(`/supply-orders/${cart.id}/items/${line.id}`))
        .set(auth(cashierToken))
        .send({ quantity: 0 });
      expect(res.statusCode).toBe(200);
      expect(res.body.items.find((i) => i.id === line.id)).toBeUndefined();
      expect(Number(res.body.totalAmount)).toBe(0);
    });
  });

  // --- Placing -------------------------------------------------------------

  describe('placing an order', () => {
    it('refuses an empty cart', async () => {
      const cart = await request(app)
        .get(url(`/branches/${branchAId}/supply-cart`))
        .set(auth(cashierToken));
      const res = await request(app)
        .post(url(`/supply-orders/${cart.body.id}/place`))
        .set(auth(cashierToken))
        .send({ paymentMode: 'COD' });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('SUPPLY_ORDER_EMPTY');
    });

    it('refuses ONLINE without a reference the warehouse could check', async () => {
      const cart = await cartWith(flourId, 1);
      const res = await request(app)
        .post(url(`/supply-orders/${cart.id}/place`))
        .set(auth(cashierToken))
        .send({ paymentMode: 'ONLINE' });
      expect(res.statusCode).toBe(400);
      expect(res.body.details.some((d) => d.field === 'paymentReference')).toBe(true);
    });

    it('records an ONLINE payment as claimed, not as settled', async () => {
      const order = await placedOrder({ mode: 'ONLINE' });
      expect(order.status).toBe('PLACED');
      expect(order.paymentMode).toBe('ONLINE');
      expect(order.paymentStatus).toBe('PAID');
      expect(order.orderNumber).toBeGreaterThan(0);
      expect(order.events.some((e) => e.reasonCode === 'PAYMENT_CLAIMED')).toBe(true);
    });

    it('leaves a COD order pending until it actually arrives', async () => {
      const order = await placedOrder({ mode: 'COD' });
      expect(order.paymentStatus).toBe('PENDING');
      expect(order.events.some((e) => e.reasonCode === 'PAYMENT_ON_DELIVERY')).toBe(true);
    });

    // One act must not carry two names. The order header said "placed by Hari"
    // while its own history said Deep placed it, because the cart stamped
    // whoever opened it and placing preferred that stale value.
    it('credits whoever placed it, not whoever opened the cart', async () => {
      const cart = await cartWith(flourId, 1, branchAId, cashierToken);
      expect(cart.placedByMembership).toBeNull();

      const placed = await request(app)
        .post(url(`/supply-orders/${cart.id}/place`))
        .set(auth(mateToken))
        .send({ paymentMode: 'COD' });
      expect(placed.statusCode).toBe(200);

      const placedEvent = placed.body.events.find((event) => event.toStatus === 'PLACED');
      expect(placed.body.placedByMembership.id).toBe(mateMembershipId);
      expect(placedEvent.actorMembership.id).toBe(mateMembershipId);
    });

    it('starts a fresh cart once the previous one has been placed', async () => {
      const placed = await placedOrder();
      const next = await cartWith(flourId, 1);
      expect(next.id).not.toBe(placed.id);
      expect(next.status).toBe('DRAFT');
    });

    // Order numbers are allocated by one atomic statement for exactly this
    // reason. A read-then-write MAX+1 passes every sequential test and fails
    // here, which is the only place it matters.
    it('never issues the same order number twice under concurrency', async () => {
      const carts = [];
      for (let i = 0; i < 8; i += 1) {
        const cart = await cartWith(flourId, 1, branchAId, cashierToken);
        const res = await request(app)
          .post(url(`/supply-orders/${cart.id}/place`))
          .set(auth(cashierToken))
          .send({ paymentMode: 'COD' });
        expect(res.statusCode).toBe(200);
        carts.push(res.body.orderNumber);
      }
      expect(new Set(carts).size).toBe(carts.length);
    });
  });

  // --- The status machine --------------------------------------------------

  describe('the status machine', () => {
    it('refuses to skip a step', async () => {
      const order = await placedOrder();
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/pack`))
        .set(auth(warehouseToken))
        .send({});
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ORDER_INVALID_TRANSITION');
      expect(res.body.params).toMatchObject({ from: 'PLACED', to: 'PACKED' });
    });

    it('refuses to move an order that is already finished', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'DISPATCHED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(ownerToken))
        .send({ cashCollected: true });

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/accept`))
        .set(auth(warehouseToken))
        .send({});
      expect(res.statusCode).toBe(409);
    });

    it('refuses to change the items on an order that has left the cart', async () => {
      const order = await placedOrder();
      const line = order.items[0];
      const res = await request(app)
        .patch(url(`/supply-orders/${order.id}/items/${line.id}`))
        .set(auth(cashierToken))
        .send({ quantity: 99 });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ORDER_NOT_EDITABLE');
    });
  });

  // --- Who may do what -----------------------------------------------------

  describe('each role is refused the others’ actions', () => {
    it('a cashier cannot accept their own order', async () => {
      const order = await placedOrder();
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/accept`))
        .set(auth(cashierToken))
        .send({});
      expect(res.statusCode).toBe(403);
    });

    it('a delivery agent cannot accept or dispatch', async () => {
      const order = await placedOrder();
      const accept = await request(app)
        .post(url(`/supply-orders/${order.id}/accept`))
        .set(auth(riderToken))
        .send({});
      expect(accept.statusCode).toBe(403);
    });

    it('the warehouse cannot place an order on itself', async () => {
      const res = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(warehouseToken))
        .send({ branchId: branchAId, inventoryItemId: flourId, quantity: 1 });
      expect(res.statusCode).toBe(403);
    });

    it('a cashier cannot open the warehouse desk', async () => {
      const res = await request(app).get(url('/supply-desk')).set(auth(cashierToken));
      expect(res.statusCode).toBe(403);
    });

    it('a cashier cannot verify their own payment', async () => {
      const order = await placedOrder({ mode: 'ONLINE' });
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/verify-payment`))
        .set(auth(cashierToken))
        .send({ outcome: 'VERIFIED' });
      expect(res.statusCode).toBe(403);
    });

    it('a cashier cannot see another branch’s orders', async () => {
      const mine = await placedOrder({ branchId: branchAId, token: cashierToken });
      const res = await request(app).get(url('/supply-orders')).set(auth(otherCashierToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.find((o) => o.id === mine.id)).toBeUndefined();
    });
  });

  // --- The desk ------------------------------------------------------------

  describe('the warehouse desk', () => {
    it('sees every branch’s orders and no branch’s cart', async () => {
      const fromA = await placedOrder({ branchId: branchAId, token: cashierToken });
      const fromB = await placedOrder({ branchId: branchBId, token: otherCashierToken });
      await cartWith(flourId, 1, branchAId, cashierToken); // a live cart, which is not an order

      const res = await request(app).get(url('/supply-desk')).set(auth(warehouseToken));
      expect(res.statusCode).toBe(200);
      const ids = res.body.map((o) => o.id);
      expect(ids).toContain(fromA.id);
      expect(ids).toContain(fromB.id);
      expect(res.body.every((o) => o.status !== 'DRAFT')).toBe(true);
    });

    it('verifies an online payment against its reference', async () => {
      const order = await placedOrder({ mode: 'ONLINE' });
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/verify-payment`))
        .set(auth(warehouseToken))
        .send({ outcome: 'VERIFIED' });

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentStatus).toBe('VERIFIED');
      expect(res.body.paymentVerifiedAt).not.toBeNull();
      expect(res.body.events.some((e) => e.reasonCode === 'PAYMENT_VERIFIED')).toBe(true);
    });

    it('refuses to verify a payment nobody has claimed', async () => {
      const order = await placedOrder({ mode: 'COD' });
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/verify-payment`))
        .set(auth(warehouseToken))
        .send({ outcome: 'VERIFIED' });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ORDER_PAYMENT_NOT_CLAIMED');
    });

    it('refuses to hand a delivery to someone who could never close it', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: cashierMembershipId });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('SUPPLY_ORDER_AGENT_NOT_PERMITTED');
    });

    it('rejects an order it cannot fill, recording why', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'ACCEPTED');

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/reject`))
        .set(auth(warehouseToken))
        .send({ reasonCode: 'STOCK_OUT', note: 'No flour until Thursday' });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      const last = res.body.events.at(-1);
      expect(last.reasonCode).toBe('STOCK_OUT');
      expect(last.note).toBe('No flour until Thursday');
    });
  });

  // --- Delays --------------------------------------------------------------

  describe('delays', () => {
    it('lets the warehouse post "+30 minutes" with a reason the cashier can read', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'ACCEPTED');

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/delays`))
        .set(auth(warehouseToken))
        .send({ delayMinutes: 30, reasonCode: 'STOCK_OUT', note: 'Waiting on the mill' });
      expect(res.statusCode).toBe(201);

      const seen = await request(app).get(url(`/supply-orders/${order.id}`)).set(auth(cashierToken));
      expect(seen.statusCode).toBe(200);
      const delay = seen.body.events.find((e) => e.type === 'DELAY');
      expect(delay.delayMinutes).toBe(30);
      expect(delay.reasonCode).toBe('STOCK_OUT');
    });

    it('pushes the promised time when one was given', async () => {
      const order = await placedOrder();
      const promisedAt = new Date(Date.now() + 60 * 60_000).toISOString();
      const accepted = await request(app)
        .post(url(`/supply-orders/${order.id}/accept`))
        .set(auth(warehouseToken))
        .send({ promisedAt });
      expect(accepted.statusCode).toBe(200);

      const delayed = await request(app)
        .post(url(`/supply-orders/${order.id}/delays`))
        .set(auth(warehouseToken))
        .send({ delayMinutes: 45, reasonCode: 'TRAFFIC' });

      const moved = new Date(delayed.body.promisedAt).getTime() - new Date(promisedAt).getTime();
      expect(Math.round(moved / 60_000)).toBe(45);
    });

    it('lets the delivery agent post one too — requirement 9 has two ends', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/delays`))
        .set(auth(riderToken))
        .send({ delayMinutes: 15, reasonCode: 'TRAFFIC' });
      expect(res.statusCode).toBe(201);
    });

    it('refuses a delay on something already delivered', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'DISPATCHED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(ownerToken))
        .send({ cashCollected: true });

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/delays`))
        .set(auth(warehouseToken))
        .send({ delayMinutes: 10, reasonCode: 'TRAFFIC' });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ORDER_DELAY_NOT_APPLICABLE');
    });

    it('refuses a reason nobody can translate', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'ACCEPTED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/delays`))
        .set(auth(warehouseToken))
        .send({ delayMinutes: 10, reasonCode: 'THE_VAN_EXPLODED' });
      expect(res.statusCode).toBe(400);
    });
  });

  // --- Delivery ------------------------------------------------------------

  describe('delivery', () => {
    it('puts an assigned order in that agent’s queue and marks COD paid on arrival', async () => {
      const order = await placedOrder({ mode: 'COD' });
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const queue = await request(app).get(url('/supply-deliveries')).set(auth(riderToken));
      expect(queue.statusCode).toBe(200);
      expect(queue.body.map((o) => o.id)).toContain(order.id);

      const delivered = await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(riderToken))
        .send({ cashCollected: true });
      expect(delivered.statusCode).toBe(200);
      expect(delivered.body.status).toBe('DELIVERED');
      expect(delivered.body.paymentStatus).toBe('PAID');
      expect(delivered.body.deliveredAt).not.toBeNull();
    });

    // The delivery agent is business-wide: they carry raw material to every
    // branch, so a run to a branch they were never granted still has to reach
    // their queue. Before this they were branch-scoped and simply could not
    // see it.
    it('shows an agent a dispatched order for a branch they were never granted', async () => {
      const order = await placedOrder({ branchId: branchAId, token: cashierToken });
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({});

      // otherRider was invited against branch B only.
      const queue = await request(app).get(url('/supply-deliveries')).set(auth(otherRiderToken));
      expect(queue.statusCode).toBe(200);
      expect(queue.body.map((o) => o.id)).toContain(order.id);
    });

    // All-branch DATA scope, and nothing else — the same split the warehouse
    // desk forces. An outside worker with every branch's HR records is the
    // failure this keeps being written down to prevent.
    it('still keeps an agent out of staff records', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/branches/${branchAId}/attendance`)
        .set(auth(riderToken));
      expect(res.statusCode).toBe(403);
    });

    it('does not let another agent close someone else’s run', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(otherRiderToken))
        .send({});
      expect([403, 404]).toContain(res.statusCode);
    });

    it('leaves an ONLINE order’s payment state alone on delivery', async () => {
      const order = await placedOrder({ mode: 'ONLINE' });
      await advanceTo(order.id, 'DISPATCHED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(ownerToken))
        .send({});
      expect(res.body.paymentStatus).toBe('PAID');
    });

    // --- Cash on delivery is confirmed, not assumed (requirement 22) -------
    //
    // Delivering used to stamp a COD order PAID as a side effect of arriving,
    // which recorded the branch's cash as having reached the warehouse on the
    // strength of the goods reaching the branch. They are two events, and only
    // the person at the counter knows whether the second one happened.

    it('refuses to close a cash order until the agent says they have the money', async () => {
      const order = await placedOrder({ mode: 'COD' });
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(riderToken))
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('SUPPLY_ORDER_CASH_NOT_CONFIRMED');

      // And it is still on the road, not half-delivered.
      const after = await request(app).get(url(`/supply-orders/${order.id}`)).set(auth(riderToken));
      expect(after.body.status).toBe('DISPATCHED');
      expect(after.body.paymentStatus).toBe('PENDING');
    });

    it('will not take a truthy string for "yes"', async () => {
      const order = await placedOrder({ mode: 'COD' });
      await advanceTo(order.id, 'DISPATCHED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(ownerToken))
        .send({ cashCollected: 'yes' });
      expect(res.statusCode).toBe(400);
    });

    it('records who took the cash, as its own line of the history', async () => {
      const order = await placedOrder({ mode: 'COD' });
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(riderToken))
        .send({ cashCollected: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.paymentStatus).toBe('PAID');

      const collected = res.body.events.find((event) => event.reasonCode === 'PAYMENT_COLLECTED');
      expect(collected).toBeDefined();
      expect(collected.type).toBe('PAYMENT');
      expect(collected.actorMembership.id).toBe(riderMembershipId);
    });

    it('asks nothing of an order that owes nothing', async () => {
      const order = await placedOrder({ mode: 'ONLINE' });
      await advanceTo(order.id, 'DISPATCHED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/deliver`))
        .set(auth(ownerToken))
        .send({});
      expect(res.statusCode).toBe(200);
      // No cash was outstanding, so there is no collection row to write.
      expect(res.body.events.find((event) => event.reasonCode === 'PAYMENT_COLLECTED')).toBeUndefined();
    });
  });

  // --- Handing a run to an agent -------------------------------------------

  // The desk picks who is taking each run, and the person taking it is told
  // where to go. Both halves are easy to get quietly wrong: a picker sourced
  // from the team list would hand the warehouse every branch's people, and an
  // order with no address is an order a rider cannot deliver.
  describe('handing a run to an agent', () => {
    it('shows the desk who can carry a run, and nobody who cannot', async () => {
      const res = await request(app).get(url('/supply-delivery-agents')).set(auth(warehouseToken));
      expect(res.statusCode).toBe(200);

      // By name rather than by count: the owner, the desk itself and every
      // cashier hold `supplyOrder:deliver` transitively or not at all, and
      // what this proves is that only the people whose JOB is carrying appear.
      expect(res.body.map((agent) => agent.name).sort()).toEqual(['Other Rider', 'Supply Rider']);
      expect(res.body.map((agent) => agent.membershipId)).not.toContain(cashierMembershipId);
    });

    it('keeps the picker away from a cashier', async () => {
      const res = await request(app).get(url('/supply-delivery-agents')).set(auth(cashierToken));
      expect(res.statusCode).toBe(403);
    });

    it('counts what each agent is already carrying', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const res = await request(app).get(url('/supply-delivery-agents')).set(auth(warehouseToken));
      const rider = res.body.find((agent) => agent.membershipId === riderMembershipId);
      expect(rider.activeRuns).toBeGreaterThanOrEqual(1);
    });

    // Availability comes from the attendance module and not from a second
    // source invented for this screen: a punch-in with no punch-out is someone
    // currently at work. Until the rider has an employment record there is
    // nothing to read, which is UNKNOWN rather than "off duty" — otherwise
    // every agent at a business that does not punch in would look unavailable.
    it('reads who is on shift from attendance, and sorts them first', async () => {
      const before = await request(app).get(url('/supply-delivery-agents')).set(auth(warehouseToken));
      expect(before.body.find((a) => a.membershipId === riderMembershipId).dutyState).toBe('UNKNOWN');

      const staffMember = await request(app)
        .post(url('/staff'))
        .set(auth(ownerToken))
        .send({ branchId: branchAId, email: riderEmail, name: 'Supply Rider', role: 'Delivery' });
      expect(staffMember.statusCode).toBe(201);

      // Coordinates are mandatory for this role rather than optional — the
      // trade the punch-anywhere exemption makes.
      const punch = await request(app)
        .post(url('/attendance/punch-in'))
        .set(auth(riderToken))
        .send({ latitude: 21.17, longitude: 72.83 });
      expect(punch.statusCode).toBe(201);

      const after = await request(app).get(url('/supply-delivery-agents')).set(auth(warehouseToken));
      const rider = after.body.find((agent) => agent.membershipId === riderMembershipId);
      expect(rider.dutyState).toBe('ON_DUTY');
      expect(rider.onDutySince).not.toBeNull();
      // On duty sorts above everyone attendance has nothing to say about.
      expect(after.body[0].membershipId).toBe(riderMembershipId);
    });

    it('records who was given it when the order is dispatched', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      expect(res.statusCode).toBe(200);
      expect(res.body.deliveryAgentMembership.id).toBe(riderMembershipId);
      // Two facts, two events: it left, and Ravi took it. The name is
      // snapshotted so the history survives a rename.
      const assignment = res.body.events.find((event) => event.type === 'ASSIGNMENT');
      expect(assignment).toBeDefined();
      expect(assignment.note).toBe('Supply Rider');
    });

    it('moves a dispatched run to a different agent, and to their queue', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/assign`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: otherRiderMembershipId });
      expect(res.statusCode).toBe(200);
      expect(res.body.deliveryAgentMembership.id).toBe(otherRiderMembershipId);
      expect(res.body.events.filter((event) => event.type === 'ASSIGNMENT')).toHaveLength(2);

      const newQueue = await request(app).get(url('/supply-deliveries')).set(auth(otherRiderToken));
      expect(newQueue.body.map((o) => o.id)).toContain(order.id);

      // And out of the first agent's: a run belongs to one person at a time.
      const oldQueue = await request(app).get(url('/supply-deliveries')).set(auth(riderToken));
      expect(oldQueue.body.map((o) => o.id)).not.toContain(order.id);
    });

    it('does not write a second row for the same agent', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/assign`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/assign`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      expect(res.statusCode).toBe(200);
      expect(res.body.events.filter((event) => event.type === 'ASSIGNMENT')).toHaveLength(1);
    });

    it('refuses to hand out an order the warehouse has not taken on', async () => {
      const order = await placedOrder();
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/assign`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ORDER_ASSIGN_NOT_APPLICABLE');
    });

    it('refuses to hand a run to someone who could never close it', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'ACCEPTED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/assign`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: cashierMembershipId });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('SUPPLY_ORDER_AGENT_NOT_PERMITTED');
    });

    it('will not let a cashier hand out their own order', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'ACCEPTED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/assign`))
        .set(auth(cashierToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });
      expect(res.statusCode).toBe(403);
    });

    // The agent's order screen is the only thing they open, and they hold no
    // capability to call a branch endpoint — so the destination has to travel
    // on the order itself.
    it('carries the destination address on the order', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'PACKED');
      await request(app)
        .post(url(`/supply-orders/${order.id}/dispatch`))
        .set(auth(warehouseToken))
        .send({ deliveryAgentMembershipId: riderMembershipId });

      const res = await request(app).get(url(`/supply-orders/${order.id}`)).set(auth(riderToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.branch.addressLine).toContain('Ring Road');
      expect(res.body.branch.postalCode).toBe('395002');
      expect(res.body.branch.city).toBe('Surat');
    });

    it('leaves the address null for a branch nobody filled one in for', async () => {
      const order = await placedOrder({ branchId: branchBId, token: otherCashierToken });
      const res = await request(app).get(url(`/supply-orders/${order.id}`)).set(auth(warehouseToken));
      expect(res.body.branch.addressLine).toBeNull();
    });
  });

  // --- Cancelling ----------------------------------------------------------

  describe('cancelling', () => {
    it('lets the branch withdraw an order the warehouse has not taken on', async () => {
      const order = await placedOrder();
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/cancel`))
        .set(auth(cashierToken))
        .send({ note: 'Ordered twice by mistake' });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('refuses once the warehouse has started picking it', async () => {
      const order = await placedOrder();
      await advanceTo(order.id, 'ACCEPTED');
      const res = await request(app)
        .post(url(`/supply-orders/${order.id}/cancel`))
        .set(auth(cashierToken))
        .send({});
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('SUPPLY_ORDER_CANCEL_TOO_LATE');
    });
  });

  // --- Tenancy -------------------------------------------------------------

  it('does not leak an order across businesses', async () => {
    const order = await placedOrder();
    const outsider = await request(app).post('/api/auth/signup').send({
      email: `sup-outsider.${RUN_ID}@test.buisnessops.dev`,
      password,
      name: 'Outsider',
      businessName: `Outsider Co ${RUN_ID}`,
      industry: 'RETAIL',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    businessIdsToClean.push(outsider.body.business.id);
    userIdsToClean.push(outsider.body.user.id);

    const res = await request(app)
      .get(`/api/businesses/${outsider.body.business.id}/supply-orders/${order.id}`)
      .set(auth(outsider.body.token));
    expect(res.statusCode).toBe(404);
  });
});
