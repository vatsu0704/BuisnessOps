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

// The branch is Asia/Kolkata and attendance is now filed against the BRANCH's
// calendar day, so the test's idea of "today" has to be IST too — under UTC
// this drifts to the previous day for 5.5 hours out of every 24. Computed with
// Intl directly rather than through utils/datetime, so the test doesn't verify
// the code against itself.
const IST = 'Asia/Kolkata';
const todayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const year = Number(todayKey.slice(0, 4));
const month = Number(todayKey.slice(5, 7));
const todayDayOfMonth = Number(todayKey.slice(8, 10));

const otherDayOfMonth = todayDayOfMonth === 1 ? 2 : 1;
const otherDate = `${year}-${String(month).padStart(2, '0')}-${String(otherDayOfMonth).padStart(2, '0')}`;

// Independent re-derivation of the work calendar, so the payroll assertions
// below are not just the service agreeing with itself. Businesses default to
// Sunday (weekday 0) as the weekly off.
const isSunday = (day) => new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
const daysInThisMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

function countWorkingDays(fromDay, toDay) {
  let n = 0;
  for (let d = fromDay; d <= toDay; d += 1) if (!isSunday(d)) n += 1;
  return n;
}

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

  it('pro-rates pay over WORKING days, not calendar days', async () => {
    // The divisor is the month's working days: calendar days minus Sundays.
    // Under the old calendar-day divisor a person with Sundays off could never
    // reach their full salary.
    const expectedWorkingDays = countWorkingDays(1, daysInThisMonth);

    // Unmarked working days default to PRESENT (Business.unmarkedWorkingDayStatus),
    // so every elapsed working day counts except the one explicitly marked
    // ABSENT. Days still in the future are pending, not absent. Today's punch
    // does not add a day when today is itself a weekly off — a PRESENT row on a
    // week-off is ignored rather than inflating the numerator.
    const elapsedWorkingDays = countWorkingDays(1, todayDayOfMonth);
    const absentCountsAsWorkingDay = !isSunday(otherDayOfMonth) && otherDayOfMonth <= todayDayOfMonth;
    const expectedDaysWorked = elapsedWorkingDays - (absentCountsAsWorkingDay ? 1 : 0);
    const expectedGross = (30000 / expectedWorkingDays) * expectedDaysWorked;

    const res = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ month, year, deductions: 100 });
    expect(res.statusCode).toBe(201);
    expect(Number(res.body.workingDays)).toBe(expectedWorkingDays);
    expect(Number(res.body.totalDaysWorked)).toBeCloseTo(expectedDaysWorked);
    expect(Number(res.body.grossPay)).toBeCloseTo(expectedGross, 2);
    expect(Number(res.body.deductions)).toBeCloseTo(100);
    expect(Number(res.body.netPay)).toBeCloseTo(expectedGross - 100, 2);

    // The basis is snapshotted, so a later raise or policy change can't restate
    // a slip someone has already been shown.
    expect(Number(res.body.baseSalary)).toBe(30000);
    expect(res.body.branchId).toBe(branchId);
    // Week-offs are reported as paid days outside the divisor.
    expect(Number(res.body.daysWeeklyOff)).toBe(daysInThisMonth - expectedWorkingDays);

    const pdf = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips/${res.body.id}/pdf`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');

    // Regenerating overwrites the same slip (same staffMemberId+monthYear)
    // rather than creating a second one — and, crucially, an omitted
    // `deductions` leaves the stored value alone instead of zeroing it.
    const regenerate = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ month, year });
    expect(regenerate.statusCode).toBe(201);
    expect(regenerate.body.id).toBe(res.body.id);
    expect(Number(regenerate.body.deductions)).toBe(100);

    const list = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips?monthYear=${res.body.monthYear}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.statusCode).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it('serves the payslip as HTML that can carry a rupee sign and Devanagari', async () => {
    const slips = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips?monthYear=${year}-${String(month).padStart(2, '0')}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const slipId = slips.body[0].id;

    const res = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips/${slipId}/document`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.text).toContain('<meta charset="utf-8">');
    expect(res.text).toContain('Attendance Staff');
    // The point of the whole rewrite: pdfmake's base-14 Helvetica had no glyph
    // for U+20B9 or any Indic script.
    expect(res.text).toContain('₹');
    // Nothing is fetched at print time — expo-print may render with no network.
    expect(res.text).not.toMatch(/https?:\/\//);

    const hindi = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips/${slipId}/document?lang=hi`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(hindi.statusCode).toBe(200);
    expect(hindi.text).toMatch(/[ऀ-ॿ]/);

    // An unknown lang falls back rather than 400ing or rendering empty labels.
    const bogus = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips/${slipId}/document?lang=zz`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(bogus.statusCode).toBe(200);
    expect(bogus.text).toContain('Salary slip');
  });

  it('escapes user-supplied text in the payslip document', async () => {
    // The document lands in a WebView, so an unescaped business name is script
    // execution, not a cosmetic bug.
    await prisma.business.update({
      where: { id: businessId },
      data: { name: 'Chai <script>alert(1)</script>' },
    });
    const slips = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips?monthYear=${year}-${String(month).padStart(2, '0')}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips/${slips.body[0].id}/document`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)');
    expect(res.text).toContain('&lt;script&gt;');

    await prisma.business.update({
      where: { id: businessId },
      data: { name: `Attendance Business ${RUN_ID}` },
    });
  });

  it('refuses to regenerate a finalized payslip', async () => {
    const slips = await request(app)
      .get(`/api/businesses/${businessId}/salary-slips?monthYear=${year}-${String(month).padStart(2, '0')}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const slipId = slips.body[0].id;

    const finalized = await request(app)
      .post(`/api/businesses/${businessId}/salary-slips/${slipId}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(finalized.statusCode).toBe(200);
    expect(finalized.body.status).toBe('FINALIZED');
    expect(finalized.body.finalizedAt).toBeTruthy();

    const regenerate = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ month, year });
    expect(regenerate.statusCode).toBe(409);
  });

  it('lists every active staff member on the roster, not only those with a record', async () => {
    // A second staff member who has never punched and has never been marked.
    const second = await request(app)
      .post(`/api/businesses/${businessId}/staff`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchId, name: 'Never Punched', role: 'Helper' });
    expect(second.statusCode).toBe(201);

    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchId}/attendance?date=${todayKey}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    // The old implementation returned only existing Attendance rows, so this
    // person was simply invisible and "who hasn't punched in?" was unanswerable.
    expect(res.body.entries).toHaveLength(2);
    const never = res.body.entries.find((e) => e.staffMember.name === 'Never Punched');
    expect(never.attendance).toBeNull();
    expect(res.body.summary.unmarked).toBe(1);
    expect(res.body.summary.total).toBe(2);
  });

  it('does not let a STAFF member read a colleague through branch access', async () => {
    // Give the STAFF membership real BranchAccess, which is what made this
    // exploitable: the old check gated on branchAccess alone, so any STAFF user
    // scoped to a branch could read every colleague's attendance in it.
    const membership = await prisma.membership.findFirst({
      where: { businessId, user: { email: staffEmail } },
    });
    await prisma.branchAccess.upsert({
      where: { membershipId_branchId: { membershipId: membership.id, branchId } },
      create: { membershipId: membership.id, branchId },
      update: {},
    });

    const colleague = await prisma.staffMember.findFirst({
      where: { businessId, name: 'Never Punched' },
    });

    const attendance = await request(app)
      .get(`/api/businesses/${businessId}/staff/${colleague.id}/attendance?month=${month}&year=${year}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(attendance.statusCode).toBe(403);

    const roster = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchId}/attendance?date=${todayKey}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(roster.statusCode).toBe(403);

    // Their own record still works — the self case must survive the fix.
    const own = await request(app)
      .get(`/api/businesses/${businessId}/staff/${staffMemberId}/attendance?month=${month}&year=${year}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(own.statusCode).toBe(200);
  });

  it('rejects marking attendance for a future date', async () => {
    const future = `${year}-${String(month).padStart(2, '0')}-${String(daysInThisMonth).padStart(2, '0')}`;
    if (daysInThisMonth === todayDayOfMonth) return; // last day of the month, nothing is future
    const res = await request(app)
      .post(`/api/businesses/${businessId}/staff/${staffMemberId}/attendance/mark`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ date: future, status: 'ABSENT' });
    expect(res.statusCode).toBe(400);
  });
});
