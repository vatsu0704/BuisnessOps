const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `bset-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `bset-cashier.${RUN_ID}@test.buisnessops.dev`;

// PATCH /branches/:branchId had no test at all. It was written during the
// payroll rebuild and then never called by anything — the app captured no
// coordinates at branch creation and had no branch settings screen, so a
// geofence could only ever be set by hand through the API. Both ends of that
// are now built, which makes this endpoint load-bearing.
describe('Branch settings', () => {
  let ownerToken;
  let cashierToken;
  let businessId;
  let branchId;
  let otherBusinessBranchId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  async function signUp(email, businessName) {
    const res = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name: email,
      businessName,
      industry: 'RETAIL',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(res.statusCode).toBe(201);
    businessIdsToClean.push(res.body.business.id);
    userIdsToClean.push(res.body.user.id);
    return res.body;
  }

  beforeAll(async () => {
    const owner = await signUp(ownerEmail, `Branch Settings ${RUN_ID}`);
    ownerToken = owner.token;
    businessId = owner.business.id;

    const branch = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set(auth(ownerToken))
      .send({ name: 'Settings Branch', code: 'BSET', timezone: 'Asia/Kolkata' });
    branchId = branch.body.id;

    const cashier = await signUp(cashierEmail, `Cashier Solo ${RUN_ID}`);
    cashierToken = cashier.token;
    const otherBranch = await request(app)
      .post(`/api/businesses/${cashier.business.id}/branches`)
      .set(auth(cashierToken))
      .send({ name: 'Other Business Branch', code: 'OTHR', timezone: 'Asia/Kolkata' });
    otherBusinessBranchId = otherBranch.body.id;

    await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set(auth(ownerToken))
      .send({ email: cashierEmail, role: 'CASHIER', branchIds: [branchId] });
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  it('starts with no geofence, which is a normal branch', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(ownerToken));
    expect(res.body.latitude).toBeNull();
    expect(res.body.geofenceRadiusMeters).toBeNull();
  });

  it('sets the location and radius together', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(ownerToken))
      .send({ latitude: 21.135432, longitude: 72.773828, geofenceRadiusMeters: 75 });

    expect(res.statusCode).toBe(200);
    expect(Number(res.body.latitude)).toBeCloseTo(21.135432, 5);
    expect(res.body.geofenceRadiusMeters).toBe(75);
  });

  it('accepts a radius on its own once the branch already has coordinates', async () => {
    // The rule is about the MERGED result, not the request body — this is the
    // case that would break if it were checked against the body alone.
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(ownerToken))
      .send({ geofenceRadiusMeters: 120 });

    expect(res.statusCode).toBe(200);
    expect(res.body.geofenceRadiusMeters).toBe(120);
  });

  it('clears the geofence when the radius is explicitly null', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(ownerToken))
      .send({ geofenceRadiusMeters: null });

    expect(res.statusCode).toBe(200);
    expect(res.body.geofenceRadiusMeters).toBeNull();
    // Clearing the radius keeps the coordinates: the branch still knows where
    // it is, it just stops enforcing a distance.
    expect(res.body.latitude).not.toBeNull();
  });

  it('refuses a radius on a branch with no coordinates, naming the reason', async () => {
    const bare = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set(auth(ownerToken))
      .send({ name: 'No Location', code: 'NOLOC', timezone: 'Asia/Kolkata' });

    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${bare.body.id}`)
      .set(auth(ownerToken))
      .send({ geofenceRadiusMeters: 50 });

    // A radius with nothing to measure from would silently never enforce.
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('GEOFENCE_NEEDS_COORDINATES');
  });

  it('rejects a latitude outside the real range, as a coded field error', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(ownerToken))
      .send({ latitude: 120, longitude: 72.7 });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.map((d) => d.code)).toContain('LATITUDE_RANGE');
  });

  it('rejects a timezone that is not a real IANA zone', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(ownerToken))
      .send({ timezone: 'Mars/Olympus_Mons' });

    // Unvalidated, this silently mis-files every punch near local midnight,
    // and therefore pays it into the wrong month.
    expect(res.statusCode).toBe(400);
    expect(res.body.details.map((d) => d.code)).toContain('TIMEZONE_INVALID');
  });

  it('refuses an empty patch rather than silently doing nothing', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(ownerToken))
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.details.map((d) => d.code)).toContain('PROVIDE_AT_LEAST_ONE');
  });

  it('refuses a branch-scoped role that has access to the branch but not branch:update', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(cashierToken))
      .send({ geofenceRadiusMeters: null });

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('404s for a branch that belongs to another business', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${otherBusinessBranchId}`)
      .set(auth(ownerToken))
      .send({ name: 'Renamed From Outside' });

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('BRANCH_NOT_FOUND');
  });

  // --- A warehouse is a location too (requirement 23) ----------------------
  //
  // Attendance, geofencing and payroll are all keyed on a branch, so a
  // warehouse has to BE one for its staff to punch in at all. What it is not
  // is a place that trades, and that is enforced rather than merely unoffered.

  describe('warehouse locations', () => {
    let warehouseId;

    it('creates one, and defaults everything else to a branch', async () => {
      const warehouse = await request(app)
        .post(`/api/businesses/${businessId}/branches`)
        .set(auth(ownerToken))
        .send({ name: 'Central Warehouse', code: `WH${RUN_ID}`, kind: 'WAREHOUSE', timezone: 'Asia/Kolkata' });
      expect(warehouse.statusCode).toBe(201);
      expect(warehouse.body.kind).toBe('WAREHOUSE');
      warehouseId = warehouse.body.id;

      // The one created in beforeAll said nothing about its kind.
      const listed = await request(app)
        .get(`/api/businesses/${businessId}/branches`)
        .set(auth(ownerToken));
      expect(listed.body.find((b) => b.id === branchId).kind).toBe('BRANCH');
    });

    it('takes a geofence like any other location, which is what punching in needs', async () => {
      const res = await request(app)
        .patch(`/api/businesses/${businessId}/branches/${warehouseId}`)
        .set(auth(ownerToken))
        .send({ latitude: 21.17, longitude: 72.83, geofenceRadiusMeters: 150 });
      expect(res.statusCode).toBe(200);
      expect(res.body.geofenceRadiusMeters).toBe(150);
    });

    it('refuses to open a counter order against it', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/counter-orders`)
        .set(auth(ownerToken))
        .send({ branchId: warehouseId });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('BRANCH_IS_WAREHOUSE');
    });

    it('refuses to open a supply cart for it — it is where the material comes from', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/branches/${warehouseId}/supply-cart`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('BRANCH_IS_WAREHOUSE');
    });

    it('can be corrected back to a branch', async () => {
      const res = await request(app)
        .patch(`/api/businesses/${businessId}/branches/${warehouseId}`)
        .set(auth(ownerToken))
        .send({ kind: 'BRANCH' });
      expect(res.statusCode).toBe(200);
      expect(res.body.kind).toBe('BRANCH');
    });

    it('refuses a kind nobody defined', async () => {
      const res = await request(app)
        .patch(`/api/businesses/${businessId}/branches/${branchId}`)
        .set(auth(ownerToken))
        .send({ kind: 'FACTORY' });
      expect(res.statusCode).toBe(400);
    });
  });
});
