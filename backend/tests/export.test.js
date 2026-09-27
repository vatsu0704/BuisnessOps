const request = require('supertest');
const XLSX = require('xlsx');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { todayKeyInZone, thisMonthKeyInZone, monthKeyMinus } = require('../src/utils/datetime');

// Day-end and month-end export — requirement 17.
//
// "Whatever entries were made across the whole day, they should be able to export
// it in the evening — and for the whole month too."
//
// What is worth proving, because each fails quietly rather than loudly:
//   1. All four record types are in one export, with totals that add up.
//   2. **The spreadsheet is read back and inspected.** A .xlsx that opens but
//      holds "₹2,000.00" as text cannot be summed, which is the whole reason
//      somebody asked for a spreadsheet rather than a PDF.
//   3. A voided token is listed and not counted.
//   4. The printable summary escapes user-supplied text. It is handed to a
//      WebView, so a branch named `<script>` is an injection.
//   5. The overlap flag fires on evidence — an expense matching a supply order —
//      and is a code in JSON and a sentence only in the document.
//   6. A cashier exports their own branch and cannot reach another's.
//   7. Any past date works, so losing the file is recoverable.
jest.setTimeout(60000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `ex-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `ex-cashier.${RUN_ID}@test.buisnessops.dev`;
const staffEmail = `ex-staff.${RUN_ID}@test.buisnessops.dev`;

const ZONE = 'Asia/Kolkata';
const TODAY = todayKeyInZone(ZONE);
const THIS_MONTH = thisMonthKeyInZone(ZONE);
const PAST_MONTH = monthKeyMinus(THIS_MONTH, 2);
const PAST_DAY = `${PAST_MONTH}-14`;

/** superagent has no parser for .xlsx, so collect the raw bytes ourselves. */
function binary(req) {
  return req.buffer().parse((res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

describe('Day-end and month-end export', () => {
  let ownerToken;
  let cashierToken;
  let staffToken;
  let businessId;
  let shopAId;
  let shopBId;
  let staffOfA;
  let gasId;
  let customCategoryId;
  const businessIdsToClean = [];
  const userIdsToClean = [];
  let orderNumber = 7000;
  let tokenNumber = 0;

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
      timezone: ZONE,
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

  // Written with Prisma rather than through the API: this suite is about what the
  // export reads and renders, and each write path has its own suite. It also lets
  // a row be dated in the past, which the counter deliberately refuses.
  function counterOrder(branchId, dateKey, amount, status = 'CLOSED') {
    tokenNumber += 1;
    return prisma.counterOrder.create({
      data: {
        businessId,
        branchId,
        tokenNumber,
        tokenDate: new Date(`${dateKey}T00:00:00.000Z`),
        status,
        totalAmount: amount,
        currency: 'INR',
        paymentMethod: 'CASH',
        items: {
          create: [
            {
              productNameSnapshot: 'Masala chai',
              quantity: 2,
              unitPrice: amount / 2,
              lineTotal: amount,
            },
          ],
        },
      },
    });
  }

  function supplyOrder(branchId, amount, at, status = 'DELIVERED') {
    orderNumber += 1;
    return prisma.supplyOrder.create({
      data: {
        businessId,
        branchId,
        orderNumber,
        status,
        totalAmount: amount,
        currency: 'INR',
        paymentMode: 'COD',
        paymentStatus: 'PAID',
        placedAt: at,
      },
    });
  }

  function expense(branchId, amount, dateKey, categoryId, note = null) {
    return prisma.expense.create({
      data: {
        businessId,
        branchId,
        categoryId,
        amount,
        currency: 'INR',
        expenseDate: new Date(`${dateKey}T00:00:00.000Z`),
        note,
        paymentMethod: 'CASH',
      },
    });
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Export Owner',
      businessName: `Export Business ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: ZONE,
    });
    expect(owner.statusCode).toBe(201);
    ownerToken = owner.body.token;
    businessId = owner.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(owner.body.user.id);

    for (const [name, code] of [
      // A name carrying markup, so the document's escaping is tested by the
      // fixture rather than by a separate contrived case.
      ['Export Shop <script>alert(1)</script>', 'EXA'],
      ['Export Shop B', 'EXB'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: ZONE });
      expect(branch.statusCode).toBe(201);
      if (code === 'EXA') shopAId = branch.body.id;
      else shopBId = branch.body.id;
    }

    cashierToken = await joinAs(cashierEmail, 'Export Cashier', 'CASHIER', [shopAId]);
    staffToken = await joinAs(staffEmail, 'Export Staff', 'STAFF', [shopAId]);

    const categories = await request(app).get(url('/expense-categories')).set(auth(ownerToken));
    gasId = categories.body.find((category) => category.code === 'GAS').id;

    // A category somebody typed, which is the only kind the overlap flag looks at.
    const custom = await request(app)
      .post(url('/expense-categories'))
      .set(auth(ownerToken))
      .send({ name: 'Flour and grain' });
    expect(custom.statusCode).toBe(201);
    customCategoryId = custom.body.id;

    staffOfA = await prisma.staffMember.create({
      data: { businessId, branchId: shopAId, name: 'Cook A', role: 'Cook', status: 'ACTIVE' },
    });

    // --- Today, at shop A: 250 + 400 sold, one void, 120 of gas, 30000 of flour
    await counterOrder(shopAId, TODAY, 250);
    await counterOrder(shopAId, TODAY, 400);
    await counterOrder(shopAId, TODAY, 999, 'VOID');
    await expense(shopAId, 120, TODAY, gasId, 'Cylinder <b>refill</b>');
    await supplyOrder(shopAId, 30000, new Date());
    // The overlap: same amount, same branch, same day, custom category.
    await expense(shopAId, 30000, TODAY, customCategoryId, 'Flour paid to warehouse');

    await prisma.attendance.create({
      data: {
        businessId,
        branchId: shopAId,
        staffMemberId: staffOfA.id,
        date: new Date(`${TODAY}T00:00:00.000Z`),
        status: 'PRESENT',
      },
    });

    // --- A settled month in the past, so "any past date works" is testable
    await counterOrder(shopAId, PAST_DAY, 1500);
    await expense(shopAId, 300, PAST_DAY, gasId);
    await prisma.salarySlip.create({
      data: {
        businessId,
        branchId: shopAId,
        staffMemberId: staffOfA.id,
        monthYear: PAST_MONTH,
        baseSalary: 20000,
        workingDays: 26,
        totalDaysWorked: 26,
        grossPay: 20000,
        netPay: 19500,
        deductions: 500,
        currency: 'INR',
        status: 'FINALIZED',
      },
    });
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('the day, as data', () => {
    it('puts all four record types in one export with totals that add up', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end?date=${TODAY}&branchId=${shopAId}`))
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      expect(res.body.kind).toBe('DAY');
      const section = res.body.branches[0];

      expect(section.counterOrders).toHaveLength(3);
      expect(section.supplyOrders).toHaveLength(1);
      expect(section.expenses).toHaveLength(2);
      expect(section.attendance).toHaveLength(1);

      // 250 + 400. The 999 was voided.
      expect(Number(section.totals.counterSales)).toBe(650);
      expect(section.totals.counterOrderCount).toBe(2);
      expect(section.totals.counterVoidCount).toBe(1);
      expect(Number(section.totals.supplySpend)).toBe(30000);
      expect(Number(section.totals.expenseTotal)).toBe(30120);
      expect(section.totals.attendance.PRESENT).toBe(1);
    });

    it('lists a voided token but never counts it', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end?date=${TODAY}&branchId=${shopAId}`))
        .set(auth(ownerToken));

      const voided = res.body.branches[0].counterOrders.filter((order) => order.status === 'VOID');
      expect(voided).toHaveLength(1);
      expect(Number(res.body.branches[0].totals.counterSales)).toBe(650);
    });

    it('covers every reachable branch when no branch is named', async () => {
      const res = await request(app).get(url(`/exports/day-end?date=${TODAY}`)).set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      expect(res.body.branches).toHaveLength(2);
      // Shop B recorded nothing, so the business total is shop A's.
      expect(Number(res.body.totals.counterSales)).toBe(650);
    });

    // R17: "Exports work for any past date, so losing the file is recoverable."
    it('exports a past date', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end?date=${PAST_DAY}&branchId=${shopAId}`))
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);
      expect(Number(res.body.totals.counterSales)).toBe(1500);
      expect(Number(res.body.totals.expenseTotal)).toBe(300);
    });

    it('reports a day that has not been closed', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end?date=${TODAY}&branchId=${shopAId}`))
        .set(auth(ownerToken));
      expect(res.body.branches[0].dayClose).toBeNull();
    });
  });

  // The §5 leftover. Flagged from evidence — two rows with the same amount on the
  // same day — rather than from guessing at a category's wording, which could not
  // work across four languages.
  describe('the double-count flag', () => {
    it('flags a custom-category expense matching a supply order, as a code', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end?date=${TODAY}&branchId=${shopAId}`))
        .set(auth(ownerToken));

      expect(res.body.overlaps).toHaveLength(1);
      const [overlap] = res.body.overlaps;
      expect(overlap.code).toBe('EXPENSE_MATCHES_SUPPLY_ORDER');
      expect(overlap.params.category).toBe('Flour and grain');
      expect(Number(overlap.params.amount)).toBe(30000);
      expect(overlap.params.orderNumber).toBeGreaterThan(0);
      // A code and params, never a sentence: the JSON is rendered by the app.
      expect(overlap.message).toBeUndefined();
    });

    it('does not flag a seeded category that happens to match', async () => {
      // Gas for exactly the supply order's amount, on a branch with its own order.
      await supplyOrder(shopBId, 4321, new Date());
      await expense(shopBId, 4321, TODAY, gasId);

      const res = await request(app)
        .get(url(`/exports/day-end?date=${TODAY}&branchId=${shopBId}`))
        .set(auth(ownerToken));

      // The seeded eight are known not to be raw material, so this is a
      // coincidence rather than a double entry.
      expect(res.body.overlaps).toHaveLength(0);
    });
  });

  describe('the spreadsheet', () => {
    async function workbookFor(suffix, token = ownerToken) {
      const res = await binary(request(app).get(url(suffix)).set(auth(token)));
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      return { res, workbook: XLSX.read(res.body, { type: 'buffer' }) };
    }

    it('has a sheet per record type and a filename a person can recognise', async () => {
      const { res, workbook } = await workbookFor(
        `/exports/day-end/workbook?date=${TODAY}&branchId=${shopAId}&lang=en`
      );

      expect(workbook.SheetNames).toEqual([
        'Summary',
        'Counter orders',
        'Supply orders',
        'Expenses',
        'Attendance',
      ]);
      expect(res.headers['content-disposition']).toContain(`day-end-${TODAY}-EXA.xlsx`);
    });

    // The point of a spreadsheet. "₹2,000.00" as text cannot be summed, and a
    // person who asked for Excel asked to be able to sum it.
    it('writes amounts as numbers, not formatted text', async () => {
      const { workbook } = await workbookFor(
        `/exports/day-end/workbook?date=${TODAY}&branchId=${shopAId}&lang=en`
      );

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Counter orders'], { header: 1 });
      const amountColumn = rows[0].indexOf('Amount');
      expect(amountColumn).toBeGreaterThan(-1);

      const amounts = rows.slice(1).map((row) => row[amountColumn]);
      expect(amounts).toContain(250);
      expect(amounts).toContain(400);
      for (const amount of amounts) expect(typeof amount).toBe('number');
    });

    it('writes dates as ISO text rather than a locale-dependent serial', async () => {
      const { workbook } = await workbookFor(
        `/exports/day-end/workbook?date=${TODAY}&branchId=${shopAId}&lang=en`
      );

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Expenses, { header: 1 });
      const dateColumn = rows[0].indexOf('Date');
      expect(rows[1][dateColumn]).toBe(TODAY);
      expect(typeof rows[1][dateColumn]).toBe('string');
    });

    it('carries a total row that matches the JSON', async () => {
      const { workbook } = await workbookFor(
        `/exports/day-end/workbook?date=${TODAY}&branchId=${shopAId}&lang=en`
      );

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Summary, { header: 1 });
      const total = rows[rows.length - 1];
      expect(total[0]).toBe('Total');
      expect(total[rows[0].indexOf('Counter sales')]).toBe(650);
    });

    it('translates its headers and sheet names', async () => {
      const { workbook } = await workbookFor(
        `/exports/day-end/workbook?date=${TODAY}&branchId=${shopAId}&lang=gu`
      );
      // Gujarati sheet names, so the spreadsheet is legible to the person who
      // asked for it rather than only to an English reader.
      expect(workbook.SheetNames[0]).toBe('સારાંશ');
      expect(workbook.SheetNames).toContain('ખર્ચ');
    });

    // A report about a branch's day has to be in that branch's clock. UTC would
    // show a 09:05 Kolkata sale as 03:35, and `Intl` with no timezone gives the
    // *server's* — a third wrong answer that looks right on a machine in India.
    it("writes timestamps in the branch's timezone, not UTC or the server's", async () => {
      // 03:35 UTC is 09:05 in Asia/Kolkata.
      const at = new Date(`${TODAY}T03:35:00.000Z`);
      tokenNumber += 1;
      await prisma.counterOrder.create({
        data: {
          businessId,
          branchId: shopBId,
          tokenNumber,
          tokenDate: new Date(`${TODAY}T00:00:00.000Z`),
          status: 'CLOSED',
          totalAmount: 60,
          currency: 'INR',
          paymentMethod: 'CASH',
          openedAt: at,
        },
      });

      const { workbook } = await workbookFor(
        `/exports/day-end/workbook?date=${TODAY}&branchId=${shopBId}&lang=en`
      );
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Counter orders'], { header: 1 });
      const openedColumn = rows[0].indexOf('Opened');
      const opened = rows.slice(1).map((row) => row[openedColumn]);

      expect(opened).toContain(`${TODAY} 09:05`);
      expect(opened).not.toContain(`${TODAY} 03:35`);
    });

    it('adds a payslips sheet only to the month export', async () => {
      const { workbook: day } = await workbookFor(
        `/exports/day-end/workbook?date=${TODAY}&branchId=${shopAId}&lang=en`
      );
      expect(day.SheetNames).not.toContain('Payslips');

      const { workbook: month } = await workbookFor(
        `/exports/month-end/workbook?month=${PAST_MONTH}&branchId=${shopAId}&lang=en`
      );
      expect(month.SheetNames).toContain('Payslips');

      const rows = XLSX.utils.sheet_to_json(month.Sheets.Payslips, { header: 1 });
      expect(rows[1][rows[0].indexOf('Net pay')]).toBe(19500);
    });
  });

  describe('the printable summary', () => {
    it('is HTML, locked down, and carries the totals', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end/document?date=${TODAY}&branchId=${shopAId}&lang=en`))
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      expect(res.text).toContain('Day-end report');
      expect(res.text).toContain('Counter sales');
    });

    // The document goes into a WebView. A branch named `<script>` must not run.
    it('escapes user-supplied text', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end/document?date=${TODAY}&branchId=${shopAId}&lang=en`))
        .set(auth(ownerToken));

      expect(res.text).not.toContain('<script>alert(1)</script>');
      expect(res.text).toContain('&lt;script&gt;');
      // The expense note carries markup too.
      expect(res.text).not.toContain('<b>refill</b>');
    });

    it('states the overlap as a sentence, which the JSON never does', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end/document?date=${TODAY}&branchId=${shopAId}&lang=en`))
        .set(auth(ownerToken));

      expect(res.text).toContain('Worth checking');
      expect(res.text).toContain('counted twice');
    });

    it('renders in the language asked for', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end/document?date=${TODAY}&branchId=${shopAId}&lang=gu`))
        .set(auth(ownerToken));
      expect(res.text).toContain('દિવસના અંતનો રિપોર્ટ');
      expect(res.text).toContain('lang="gu"');
    });
  });

  describe('the month', () => {
    it('includes payslips, which the day export does not', async () => {
      const res = await request(app)
        .get(url(`/exports/month-end?month=${PAST_MONTH}&branchId=${shopAId}`))
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      expect(res.body.kind).toBe('MONTH');
      expect(res.body.branches[0].salarySlips).toHaveLength(1);
      expect(Number(res.body.totals.payroll)).toBe(19500);
      expect(res.body.totals.payslipDraftCount).toBe(0);
    });

    it('rolls the whole month up, not one day of it', async () => {
      const res = await request(app)
        .get(url(`/exports/month-end?month=${PAST_MONTH}&branchId=${shopAId}`))
        .set(auth(ownerToken));
      expect(Number(res.body.totals.counterSales)).toBe(1500);
    });

    it('refuses a month that is not a month', async () => {
      const res = await request(app).get(url('/exports/month-end?month=2026-13')).set(auth(ownerToken));
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0]).toMatchObject({ code: 'FIELD_MUST_BE_MONTH', field: 'month' });
    });
  });

  describe('who may export what', () => {
    // The capability says whether you may export; branch access says what. One
    // endpoint therefore serves a cashier and an admin with no role name anywhere.
    it('scopes a cashier to their own branch even when they ask for everything', async () => {
      const res = await request(app).get(url(`/exports/day-end?date=${TODAY}`)).set(auth(cashierToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.branches).toHaveLength(1);
      expect(res.body.branches[0].branch.id).toBe(shopAId);
    });

    it('refuses a cashier a branch they cannot reach', async () => {
      const res = await request(app)
        .get(url(`/exports/day-end?date=${TODAY}&branchId=${shopBId}`))
        .set(auth(cashierToken));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('refuses a role with no export capability', async () => {
      const res = await request(app).get(url(`/exports/day-end?date=${TODAY}`)).set(auth(staffToken));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');

      const month = await request(app).get(url('/exports/month-end')).set(auth(staffToken));
      expect(month.statusCode).toBe(403);
    });

    it('refuses the spreadsheet and the document too, not only the JSON', async () => {
      for (const suffix of ['/exports/day-end/workbook', '/exports/day-end/document']) {
        const res = await request(app).get(url(suffix)).set(auth(staffToken));
        expect(res.statusCode).toBe(403);
      }
    });
  });
});
