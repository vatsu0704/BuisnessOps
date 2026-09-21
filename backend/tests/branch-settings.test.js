const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `bset-owner.${RUN_ID}@test.buisnessops.dev`;
const managerEmail = `bset-manager.${RUN_ID}@test.buisnessops.dev`;

// PATCH /branches/:branchId had no test at all. It was written during the
// payroll rebuild and then never called by anything — the app captured no
// coordinates at branch creation and had no branch settings screen, so a
// geofence could only ever be set by hand through the API. Both ends of that
// are now built, which makes this endpoint load-bearing.
describe('Branch settings', () => {
  let ownerToken;
  let managerToken;
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

    const manager = await signUp(managerEmail, `Manager Solo ${RUN_ID}`);
    managerToken = manager.token;
    const otherBranch = await request(app)
      .post(`/api/businesses/${manager.business.id}/branches`)
      .set(auth(managerToken))
      .send({ name: 'Other Business Branch', code: 'OTHR', timezone: 'Asia/Kolkata' });
    otherBusinessBranchId = otherBranch.body.id;

    await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set(auth(ownerToken))
      .send({ email: managerEmail, role: 'MANAGER', branchIds: [branchId] });
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

  it('is owner/admin only — a manager with access to the branch still cannot change it', async () => {
    const res = await request(app)
      .patch(`/api/businesses/${businessId}/branches/${branchId}`)
      .set(auth(managerToken))
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
});
