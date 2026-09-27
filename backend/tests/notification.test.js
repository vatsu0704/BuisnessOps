const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Notifications — requirements 2 and 8.
//
// These run with NO Firebase credentials, which is the point: the whole
// feature has to work as a record even where it cannot be delivered. What is
// worth proving:
//   1. Marking attendance notifies the worker — and still succeeds for one who
//      has no app account at all (requirement 2, in as many words).
//   2. Who is told is decided by CAPABILITY, so the warehouse hears about a new
//      order and a delivery agent does not.
//   3. The actor is never told about their own action.
//   4. A notification is a code and its params, never a sentence.
//   5. The list is scoped to the business AND the person, and one member cannot
//      read another's.
//   6. Attendance cannot be switched off, and everything else can.
jest.setTimeout(45000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `ntf-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `ntf-cashier.${RUN_ID}@test.buisnessops.dev`;
const warehouseEmail = `ntf-warehouse.${RUN_ID}@test.buisnessops.dev`;
const workerEmail = `ntf-worker.${RUN_ID}@test.buisnessops.dev`;

describe('Notifications', () => {
  let ownerToken;
  let cashierToken;
  let warehouseToken;
  let workerToken;
  let workerUserId;
  let businessId;
  let branchId;
  let staffMemberId;
  let orphanStaffId;
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
    return { token: login.body.token, userId: signup.body.user.id };
  }

  function notificationsOf(token) {
    return request(app).get(url('/notifications')).set(auth(token));
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Notify Owner',
      businessName: `Notify Business ${RUN_ID}`,
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

    const branch = await request(app)
      .post(url('/branches'))
      .set(auth(ownerToken))
      .send({ name: 'Notify Branch', code: 'NTB', timezone: 'Asia/Kolkata' });
    expect(branch.statusCode).toBe(201);
    branchId = branch.body.id;

    ({ token: cashierToken } = await joinAs(cashierEmail, 'Notify Cashier', 'CASHIER', [branchId]));
    ({ token: warehouseToken } = await joinAs(warehouseEmail, 'Notify Warehouse', 'WAREHOUSE', []));
    ({ token: workerToken, userId: workerUserId } = await joinAs(
      workerEmail,
      'Notify Worker',
      'STAFF',
      [branchId]
    ));

    // A staff record linked to the worker's account — this is what makes them
    // notifiable at all.
    const staff = await request(app)
      .post(url('/staff'))
      .set(auth(ownerToken))
      .send({ name: 'Notify Worker', role: 'Cook', email: workerEmail, branchId, baseSalary: 20000 });
    expect(staff.statusCode).toBe(201);
    staffMemberId = staff.body.id;

    // And one with no account behind it at all, for the requirement-2 case.
    const orphan = await request(app)
      .post(url('/staff'))
      .set(auth(ownerToken))
      .send({ name: 'No App Worker', role: 'Helper', branchId, baseSalary: 15000 });
    expect(orphan.statusCode).toBe(201);
    orphanStaffId = orphan.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('requirement 2 — the worker is told', () => {
    it('notifies a worker who was marked absent, as a code and its values', async () => {
      const marked = await request(app)
        .post(url(`/staff/${staffMemberId}/attendance/mark`))
        .set(auth(ownerToken))
        .send({ date: '2026-09-20', status: 'ABSENT' });
      expect(marked.statusCode).toBe(201);

      const list = await notificationsOf(workerToken);
      expect(list.statusCode).toBe(200);

      const notification = list.body.find((n) => n.code === 'ATTENDANCE_MARKED_ABSENT');
      expect(notification).toBeTruthy();
      // A code and its params — never a sentence. The device renders it, which
      // is what lets an old notification appear in today's language.
      expect(notification.params.date).toBe('2026-09-20');
      expect(notification.params.branch).toBe('Notify Branch');
      expect(notification.status).toBe('UNREAD');
      expect(notification.deepLink).toEqual({ route: 'Attendance' });
      // No Firebase in the test environment, so nothing was pushed — and that
      // is not a failure. The row is the feature; the push is best effort.
      expect(notification.sentAt).toBeNull();
    });

    // The requirement says this in as many words: a worker with no app account
    // is simply not notified, and marking still succeeds.
    it('still marks a worker who has no app account', async () => {
      const marked = await request(app)
        .post(url(`/staff/${orphanStaffId}/attendance/mark`))
        .set(auth(ownerToken))
        .send({ date: '2026-09-20', status: 'PRESENT' });
      expect(marked.statusCode).toBe(201);
      expect(marked.body.status).toBe('PRESENT');
    });

    it('does not notify anybody else about it', async () => {
      const list = await notificationsOf(cashierToken);
      expect(list.body.some((n) => n.code.startsWith('ATTENDANCE_'))).toBe(false);
    });
  });

  describe('requirement 3 — who hears about a new order', () => {
    let orderId;

    beforeAll(async () => {
      const item = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: 'Notify Flour', unit: 'kg', unitPrice: 40 });
      expect(item.statusCode).toBe(201);

      // Adding a line IS how a cart comes into existence — there is no
      // separate "create cart" call, which is the shape SupplyCartScreen uses.
      const cart = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(cashierToken))
        .send({ branchId, inventoryItemId: item.body.id, quantity: 5 });
      expect(cart.statusCode).toBe(201);
      orderId = cart.body.id;

      const placed = await request(app)
        .post(url(`/supply-orders/${orderId}/place`))
        .set(auth(cashierToken))
        .send({ paymentMode: 'COD' });
      expect(placed.statusCode).toBe(200);
    });

    // Never a role name: this is everyone holding `supplyOrder:fulfil`, so a
    // role added later that also fulfils orders is notified with no edit.
    it('tells the warehouse desk', async () => {
      const list = await notificationsOf(warehouseToken);
      const notification = list.body.find((n) => n.code === 'SUPPLY_ORDER_PLACED');
      expect(notification).toBeTruthy();
      expect(notification.params.branch).toBe('Notify Branch');
      expect(notification.deepLink.route).toBe('SupplyOrderDetail');
    });

    it('does not tell the cashier who placed it', async () => {
      const list = await notificationsOf(cashierToken);
      expect(list.body.some((n) => n.code === 'SUPPLY_ORDER_PLACED')).toBe(false);
    });

    it('tells the branch when the warehouse accepts it', async () => {
      const accepted = await request(app)
        .post(url(`/supply-orders/${orderId}/accept`))
        .set(auth(warehouseToken))
        .send({});
      expect(accepted.statusCode).toBe(200);

      const list = await notificationsOf(cashierToken);
      expect(list.body.some((n) => n.code === 'SUPPLY_ORDER_ACCEPTED')).toBe(true);
    });

    // Requirement 9's whole point — the branch finds out without ringing.
    it('tells the branch about a delay, with the minutes as a param', async () => {
      const delayed = await request(app)
        .post(url(`/supply-orders/${orderId}/delays`))
        .set(auth(warehouseToken))
        .send({ delayMinutes: 30, reasonCode: 'STOCK_OUT' });
      expect(delayed.statusCode).toBe(201);

      const list = await notificationsOf(cashierToken);
      const notification = list.body.find((n) => n.code === 'SUPPLY_ORDER_DELAYED');
      expect(notification).toBeTruthy();
      expect(Number(notification.params.minutes)).toBe(30);
    });
  });

  describe('the centre', () => {
    it('counts unread, marks one read, and marks the rest', async () => {
      const before = await request(app)
        .get(url('/notifications/unread-count'))
        .set(auth(cashierToken));
      expect(before.body.count).toBeGreaterThan(0);

      const list = await notificationsOf(cashierToken);
      const first = list.body[0];

      const read = await request(app)
        .post(url(`/notifications/${first.id}/read`))
        .set(auth(cashierToken));
      expect(read.statusCode).toBe(200);
      expect(read.body.status).toBe('READ');

      const all = await request(app).post(url('/notifications/read-all')).set(auth(cashierToken));
      expect(all.statusCode).toBe(200);

      const after = await request(app)
        .get(url('/notifications/unread-count'))
        .set(auth(cashierToken));
      expect(after.body.count).toBe(0);
    });

    // Knowing an id must not be enough to read somebody else's mail.
    it("refuses to mark another person's notification read", async () => {
      const theirs = await notificationsOf(workerToken);
      expect(theirs.body.length).toBeGreaterThan(0);

      const res = await request(app)
        .post(url(`/notifications/${theirs.body[0].id}/read`))
        .set(auth(cashierToken));
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');
    });
  });

  describe('requirement 8 — device registration and preferences', () => {
    it('registers a device with the language THAT DEVICE is showing', async () => {
      const res = await request(app)
        .post('/api/notifications/device-token')
        .set(auth(workerToken))
        .send({ token: `tok-worker-${RUN_ID}`, platform: 'ANDROID', locale: 'GU' });
      expect(res.statusCode).toBe(201);
      expect(res.body.locale).toBe('GU');
    });

    // A phone signing in as somebody else must MOVE, not duplicate — or the
    // person who signed out keeps receiving notifications on it.
    it('moves a token to the new user when the same handset signs in as somebody else', async () => {
      const shared = `tok-shared-${RUN_ID}`;
      await request(app)
        .post('/api/notifications/device-token')
        .set(auth(workerToken))
        .send({ token: shared, platform: 'ANDROID', locale: 'EN' });
      await request(app)
        .post('/api/notifications/device-token')
        .set(auth(cashierToken))
        .send({ token: shared, platform: 'ANDROID', locale: 'HI' });

      const rows = await prisma.deviceToken.findMany({ where: { token: shared } });
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).not.toBe(workerUserId);
    });

    it('lists the categories, with attendance flagged as required', async () => {
      const res = await request(app).get('/api/notifications/preferences').set(auth(cashierToken));
      expect(res.statusCode).toBe(200);

      const attendance = res.body.find((p) => p.category === 'attendance');
      expect(attendance.required).toBe(true);
      expect(attendance.enabled).toBe(true);
      expect(res.body.map((p) => p.category)).toEqual(
        expect.arrayContaining(['orders', 'delays', 'payments', 'deliveries'])
      );
    });

    it('turns a category off and back on', async () => {
      const off = await request(app)
        .patch('/api/notifications/preferences/orders')
        .set(auth(cashierToken))
        .send({ enabled: false });
      expect(off.statusCode).toBe(200);
      expect(off.body.find((p) => p.category === 'orders').enabled).toBe(false);

      const on = await request(app)
        .patch('/api/notifications/preferences/orders')
        .set(auth(cashierToken))
        .send({ enabled: true });
      expect(on.body.find((p) => p.category === 'orders').enabled).toBe(true);
    });

    // Muting stops the ROW, not only the push. A badge still counting order
    // updates would contradict the switch that was just moved — and nothing is
    // lost, because the event itself is in SupplyOrderEvent either way.
    it('records nothing at all for a muted category', async () => {
      await request(app)
        .patch('/api/notifications/preferences/orders')
        .set(auth(warehouseToken))
        .send({ enabled: false });

      const before = (await notificationsOf(warehouseToken)).body.filter(
        (n) => n.code === 'SUPPLY_ORDER_PLACED'
      ).length;

      const item = await request(app)
        .post(url('/supply-items'))
        .set(auth(ownerToken))
        .send({ name: `Muted Sugar ${RUN_ID}`, unit: 'kg', unitPrice: 55 });
      const cart = await request(app)
        .post(url('/supply-cart/items'))
        .set(auth(cashierToken))
        .send({ branchId, inventoryItemId: item.body.id, quantity: 2 });
      const placed = await request(app)
        .post(url(`/supply-orders/${cart.body.id}/place`))
        .set(auth(cashierToken))
        .send({ paymentMode: 'COD' });
      expect(placed.statusCode).toBe(200);

      const after = (await notificationsOf(warehouseToken)).body.filter(
        (n) => n.code === 'SUPPLY_ORDER_PLACED'
      ).length;
      expect(after).toBe(before);

      await request(app)
        .patch('/api/notifications/preferences/orders')
        .set(auth(warehouseToken))
        .send({ enabled: true });
    });

    // Requirement 2 exists so a worker finds out they were marked absent. A
    // switch that hid that would defeat the requirement it was built for, so
    // it refuses rather than silently ignoring.
    it('refuses to turn attendance off', async () => {
      const res = await request(app)
        .patch('/api/notifications/preferences/attendance')
        .set(auth(cashierToken))
        .send({ enabled: false });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('NOTIFICATION_CATEGORY_REQUIRED');
    });

    it('refuses a category it has never heard of', async () => {
      const res = await request(app)
        .patch('/api/notifications/preferences/horoscopes')
        .set(auth(cashierToken))
        .send({ enabled: false });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('NOTIFICATION_CATEGORY_UNKNOWN');
    });
  });
});
