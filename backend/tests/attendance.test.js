const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `att-owner.${RUN_ID}@test.buisnessops.dev`;
const staffEmail = `att-staff.${RUN_ID}@test.buisnessops.dev`;

// A real branch location + a coordinate ~11m away (inside a 50m geofence)
// and one ~1.4km away (outside it).
const BRANCH_LAT = 23.0225;
const BRANCH_LNG = 72.5714;
const NEARBY = { latitude: 23.0226, longitude: 72.5714 };
const FAR_AWAY = { latitude: 23.0350, longitude: 72.5714 };

const now = new Date();
const month = now.getUTCMonth() + 1;
const year = now.getUTCFullYear();
const otherDayOfMonth = now.getUTCDate() === 1 ? 2 : 1;
const otherDate = `${year}-${String(month).padStart(2, '0')}-${String(otherDayOfMonth).padStart(2, '0')}`;

describe('Attendance & Salary Slip module', () => {
  let ownerToken;
  let staffToken;
  let businessId;
  let branchId;
  let staffMemberId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  beforeAll(async () => {
    const ownerSignup = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Attendance Owner',
      businessName: `Attendance Business ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(ownerSignup.statusCode).toBe(201);
    ownerToken = ownerSignup.body.token;
    businessId = ownerSignup.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(ownerSignup.body.user.id);

    const staffSignup = await request(app).post('/api/auth/signup').send({
      email: staffEmail,
      password,
      name: 'Attendance Staff',
      businessName: `Attendance Staff Solo ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    businessIdsToClean.push(staffSignup.body.business.id);
    userIdsToClean.push(staffSignup.body.user.id);

    const branch = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Geo Branch',
        code: 'GEO',
        timezone: 'Asia/Kolkata',
        latitude: BRANCH_LAT,
        longitude: BRANCH_LNG,
        geofenceRadiusMeters: 50,
      });
    expect(branch.statusCode).toBe(201);
    branchId = branch.body.id;

    await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: staffEmail, role: 'STAFF' });
    const staffLogin = await request(app).post('/api/auth/login').send({ email: staffEmail, password });
    staffToken = staffLogin.body.token;

    const staffMember = await request(app)
      .post(`/api/businesses/${businessId}/staff`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchId, email: staffEmail, name: 'Attendance Staff', role: 'Cashier', baseSalary: 30000 });
    expect(staffMember.statusCode).toBe(201);
    staffMemberId = staffMember.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  it('rejects punch-in from someone with no linked StaffMember row', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/attendance/punch-in`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(res.statusCode).toBe(404);
  });

  it('rejects punch-in outside the branch geofence', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/attendance/punch-in`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(FAR_AWAY);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/outside the allowed/);
  });

  it('punches in and out within the geofence, and blocks a double punch', async () => {
    const punchIn = await request(app)
      .post(`/api/businesses/${businessId}/attendance/punch-in`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(NEARBY);
    expect(punchIn.statusCode).toBe(201);
    expect(punchIn.body.status).toBe('PRESENT');
    expect(punchIn.body.punchInAt).toBeTruthy();

    const doublePunch = await request(app)
      .post(`/api/businesses/${businessId}/attendance/punch-in`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(NEARBY);
    expect(doublePunch.statusCode).toBe(409);

    const punchOut = await request(app)
      .post(`/api/businesses/${businessId}/attendance/punch-out`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(NEARBY);
    expect(punchOut.statusCode).toBe(200);
    expect(punchOut.body.punchOutAt).toBeTruthy();

    const doublePunchOut = await request(app)
      .post(`/api/businesses/${businessId}/attendance/punch-out`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(NEARBY);
    expect(doublePunchOut.statusCode).toBe(409);
  });

  it('lets a manager/owner mark a day absent without a punch', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/attendance/mark`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ date: otherDate, status: 'ABSENT' });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('ABSENT');
  });

  it("blocks a non-owner/manager/admin from marking someone else's attendance", async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/attendance/mark`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ date: otherDate, status: 'HALF_DAY' });
    expect(res.statusCode).toBe(403);
  });

  it('returns the monthly attendance combining the punch and the manual mark', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/staff/${staffMemberId}/attendance?month=${month}&year=${year}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    const statuses = res.body.map((r) => r.status).sort();
    expect(statuses).toEqual(['ABSENT', 'PRESENT']);

    // The staff member can read their own record via the same endpoint.
    const self = await request(app)
      .get(`/api/businesses/${businessId}/staff/${staffMemberId}/attendance?month=${month}&year=${year}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(self.statusCode).toBe(200);
    expect(self.body).toHaveLength(2);
  });

  it('rejects a non-owner/admin generating a salary slip', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ month, year });
    expect(res.statusCode).toBe(403);
  });

  it('generates a salary slip with the correct pro-rated pay, and a downloadable PDF', async () => {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const expectedGross = (30000 / daysInMonth) * 1; // 1 PRESENT day; the ABSENT day contributes 0

    const res = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ month, year, deductions: 100 });
    expect(res.statusCode).toBe(201);
    expect(Number(res.body.totalDaysWorked)).toBeCloseTo(1);
    expect(Number(res.body.grossPay)).toBeCloseTo(expectedGross, 2);
    expect(Number(res.body.deductions)).toBeCloseTo(100);
    expect(Number(res.body.netPay)).toBeCloseTo(expectedGross - 100, 2);

    const pdf = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips/${res.body.id}/pdf`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');

    // Regenerating overwrites the same slip (same staffMemberId+monthYear)
    // rather than creating a second one.
    const regenerate = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ month, year });
    expect(regenerate.statusCode).toBe(201);
    expect(regenerate.body.id).toBe(res.body.id);

    const list = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips?monthYear=${res.body.monthYear}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.statusCode).toBe(200);
    expect(list.body).toHaveLength(1);
  });
});
