const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { localMonthRange, monthKeyMinus, thisMonthKeyInZone } = require('../src/utils/datetime');

// Branch × month analytics and net profit — requirements 13 and 15.
//
// Requirement 13's acceptance criterion is that net profit be **reproducible by
// hand**, so this test does the opposite of the usual thing: rather than
// checking a shape, it puts round numbers in and asserts the exact figures that
// must come out. Every expectation below can be checked with a pen.
//
// What is worth proving, because each fails silently rather than loudly:
//   1. The formula, per branch, against known inputs.
//   2. A warehouse is a cost centre — real costs, no sales, and no special case
//      in the arithmetic.
//   3. **The reconciliation identity.** Σ(branch net) + internalTransfer ===
//      business net. If that ever stops holding, the two levels are telling
//      different stories and neither is trustworthy.
//   4. Money that was never spent is not counted: a DRAFT cart, a CANCELLED
//      order, a VOIDED sale.
//   5. A branch's month is the branch's own month. A sale at 00:30 on the 1st in
//      IST belongs to that month, and asking in UTC would file it in the
//      previous one.
//   6. A cashier reads their own branch and is not handed the business total.
jest.setTimeout(60000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `an-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `an-cashier.${RUN_ID}@test.buisnessops.dev`;
const staffEmail = `an-staff.${RUN_ID}@test.buisnessops.dev`;

const ZONE = 'Asia/Kolkata';

// Two settled months in the past, so "today" cannot wander into the window
// mid-run and no figure depends on when the suite happens to be executed.
const MONTH = monthKeyMinus(thisMonthKeyInZone(ZONE), 2);
const PREV_MONTH = monthKeyMinus(thisMonthKeyInZone(ZONE), 3);

/** Mid-month in the branch's own timezone — unambiguously inside `month`. */
function midMonth(month) {
  const { start, end } = localMonthRange(month, ZONE);
  return new Date((start.getTime() + end.getTime()) / 2);
}

describe('Branch analytics and net profit', () => {
  let ownerToken;
  let cashierToken;
  let staffToken;
  let businessId;
  let shopAId;
  let shopBId;
  let warehouseId;
  let staffOfA;
  let staffOfWarehouse;
  const businessIdsToClean = [];
  const userIdsToClean = [];
  let orderNumber = 9000;

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const url = (suffix) => `/api/businesses/${businessId}${suffix}`;

  const grid = (token, query = '') =>
    request(app).get(url(`/analytics/branch-monthly${query}`)).set(auth(token));

  const branchIn = (body, branchId) => body.branches.find((row) => row.branchId === branchId);
  const cellIn = (body, branchId, month) => branchIn(body, branchId).months.find((c) => c.month === month);

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

  // The figures are written with Prisma rather than through the API on purpose.
  // Counter billing can only ring up today and payroll only generates for a
  // month it can compute a roster for; this test is about the arithmetic over
  // known inputs, and each of those write paths is covered by its own suite.
  function sale(branchId, amount, at, status = 'COMPLETED') {
    return prisma.transaction.create({
      data: {
        businessId,
        branchId,
        occurredAt: at,
        totalAmount: amount,
        currency: 'INR',
        paymentMethod: 'UNSPECIFIED',
        status,
        source: 'COUNTER',
      },
    });
  }

  function expense(branchId, amount, dateKey, categoryId) {
    return prisma.expense.create({
      data: {
        businessId,
        branchId,
        categoryId,
        amount,
        currency: 'INR',
        expenseDate: new Date(`${dateKey}T00:00:00.000Z`),
        paymentMethod: 'CASH',
      },
    });
  }

  function supplyOrder(branchId, amount, at, status = 'PLACED') {
    orderNumber += 1;
    return prisma.supplyOrder.create({
      data: {
        businessId,
        branchId,
        orderNumber: status === 'DRAFT' ? null : orderNumber,
        status,
        totalAmount: amount,
        currency: 'INR',
        paymentMode: status === 'DRAFT' ? null : 'COD',
        placedAt: status === 'DRAFT' ? null : at,
      },
    });
  }

  function payslip(staffMemberId, branchId, monthYear, netPay, status = 'FINALIZED') {
    return prisma.salarySlip.create({
      data: {
        businessId,
        branchId,
        staffMemberId,
        monthYear,
        baseSalary: netPay,
        workingDays: 26,
        totalDaysWorked: 26,
        grossPay: netPay,
        netPay,
        currency: 'INR',
        status,
      },
    });
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Analytics Owner',
      businessName: `Analytics Business ${RUN_ID}`,
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

    for (const [name, code, kind] of [
      ['Analytics Shop A', 'ANA', 'BRANCH'],
      ['Analytics Shop B', 'ANB', 'BRANCH'],
      ['Analytics Warehouse', 'ANW', 'WAREHOUSE'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: ZONE, kind });
      expect(branch.statusCode).toBe(201);
      if (code === 'ANA') shopAId = branch.body.id;
      else if (code === 'ANB') shopBId = branch.body.id;
      else warehouseId = branch.body.id;
    }

    cashierToken = await joinAs(cashierEmail, 'Analytics Cashier', 'CASHIER', [shopAId]);
    staffToken = await joinAs(staffEmail, 'Analytics Staff', 'STAFF', [shopAId]);

    const categories = await request(app).get(url('/expense-categories')).set(auth(ownerToken));
    const gasId = categories.body.find((category) => category.code === 'GAS').id;

    staffOfA = await prisma.staffMember.create({
      data: { businessId, branchId: shopAId, name: 'Cook A', role: 'Cook', status: 'ACTIVE' },
    });
    staffOfWarehouse = await prisma.staffMember.create({
      data: { businessId, branchId: warehouseId, name: 'Loader W', role: 'Loader', status: 'ACTIVE' },
    });

    const at = midMonth(MONTH);
    const dayKey = `${MONTH}-15`;

    // Shop A — the worked example from the plan.
    //   sales 1,00,000 − expenses 12,000 − material 30,000 − payroll 45,000
    //   = 13,000
    await sale(shopAId, 100000, at);
    await expense(shopAId, 12000, dayKey, gasId);
    await supplyOrder(shopAId, 30000, at);
    await payslip(staffOfA.id, shopAId, MONTH, 45000);

    // The warehouse — costs only. 35,000 of that is the flour it bought from
    // the outside world, logged as an ordinary expense because there is no
    // purchase model; see §5 of REQUIREMENTS.md.
    await expense(warehouseId, 35000, dayKey, gasId);
    await payslip(staffOfWarehouse.id, warehouseId, MONTH, 20000);

    // Money that was never spent, and a sale that was taken back. None of these
    // may appear anywhere in the figures.
    await supplyOrder(shopAId, 500000, at, 'DRAFT');
    await supplyOrder(shopAId, 700000, at, 'CANCELLED');
    await sale(shopAId, 900000, at, 'VOIDED');
    await sale(shopAId, 800000, at, 'REFUNDED');

    // The month before, so there is a trend to measure. Shop A earned more then
    // and is therefore declining.
    await sale(shopAId, 200000, midMonth(PREV_MONTH));
    await payslip(staffOfA.id, shopAId, PREV_MONTH, 45000);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('the formula, per branch', () => {
    it('computes a trading branch from its own rows', async () => {
      const res = await grid(ownerToken, `?from=${MONTH}&to=${MONTH}`);
      expect(res.statusCode).toBe(200);

      const cell = cellIn(res.body, shopAId, MONTH);
      expect(Number(cell.sales)).toBe(100000);
      expect(Number(cell.expenses)).toBe(12000);
      expect(Number(cell.materialSpend)).toBe(30000);
      expect(Number(cell.payroll)).toBe(45000);
      expect(Number(cell.netProfit)).toBe(13000);
    });

    // A warehouse has staff, a roster and an electricity bill, and no till. The
    // point is that no branch of the formula is needed for it: sales and
    // material spend are structurally zero, so the same expression produces
    // -(expenses + payroll) by itself.
    it('treats a warehouse as a cost centre without a special case', async () => {
      const res = await grid(ownerToken, `?from=${MONTH}&to=${MONTH}`);

      const row = branchIn(res.body, warehouseId);
      expect(row.isCostCentre).toBe(true);

      const cell = cellIn(res.body, warehouseId, MONTH);
      expect(Number(cell.sales)).toBe(0);
      expect(Number(cell.materialSpend)).toBe(0);
      expect(Number(cell.expenses)).toBe(35000);
      expect(Number(cell.payroll)).toBe(20000);
      expect(Number(cell.netProfit)).toBe(-55000);
    });

    it('reports a branch with nothing recorded as zero rather than omitting it', async () => {
      const res = await grid(ownerToken, `?from=${MONTH}&to=${MONTH}`);

      const cell = cellIn(res.body, shopBId, MONTH);
      expect(Number(cell.sales)).toBe(0);
      expect(Number(cell.netProfit)).toBe(0);
    });
  });

  // The identity that keeps the two levels honest. If this breaks, the branch
  // column and the business total are describing different businesses.
  describe('the reconciliation identity', () => {
    it('has the business total differ from the branch column by exactly the internal transfer', async () => {
      const res = await grid(ownerToken, `?from=${MONTH}&to=${MONTH}`);
      const { total, reconciliation } = res.body.business;

      // 1,00,000 sold to customers; 47,000 of expenses and 65,000 of wages
      // across all three locations. The 30,000 of flour never left the business.
      expect(Number(total.customerSales)).toBe(100000);
      expect(Number(total.expenses)).toBe(47000);
      expect(Number(total.payroll)).toBe(65000);
      expect(Number(total.internalTransfer)).toBe(30000);
      expect(Number(total.netProfit)).toBe(-12000);

      // 13,000 + (-55,000) + 0
      expect(Number(reconciliation.branchNetProfitSum)).toBe(-42000);
      expect(Number(reconciliation.branchNetProfitSum) + Number(reconciliation.internalTransfer)).toBe(
        Number(total.netProfit)
      );
      expect(reconciliation.balances).toBe(true);
    });

    it('still balances across a multi-month window', async () => {
      const res = await grid(ownerToken, `?from=${PREV_MONTH}&to=${MONTH}`);
      const { total, reconciliation } = res.body.business;

      expect(reconciliation.balances).toBe(true);
      expect(Number(reconciliation.branchNetProfitSum) + Number(total.internalTransfer)).toBe(
        Number(total.netProfit)
      );
    });
  });

  describe('money that was never spent', () => {
    // Each of these is a row that exists and must not be counted. A DRAFT cart
    // nobody placed, an order that was cancelled, a sale that was voided or
    // refunded. Every one of them is large enough that including it would be
    // unmistakable in the figures above.
    it('excludes a DRAFT cart, a CANCELLED order, and a VOIDED or REFUNDED sale', async () => {
      const res = await grid(ownerToken, `?from=${MONTH}&to=${MONTH}`);
      const cell = cellIn(res.body, shopAId, MONTH);

      expect(Number(cell.materialSpend)).toBe(30000);
      expect(Number(cell.sales)).toBe(100000);
      expect(cell.materialOrderCount).toBe(1);
      expect(cell.saleCount).toBe(1);
    });
  });

  // The reason localMonthRange exists. In IST a month begins at 18:30 UTC on
  // the last day of the previous month, so a UTC-keyed query files the first
  // five and a half hours of every month against the month before.
  describe("a branch's month is the branch's own month", () => {
    it('counts a sale in the first minutes of the local month against that month', async () => {
      const { start } = localMonthRange(MONTH, ZONE);
      const justInside = new Date(start.getTime() + 60000);
      const justOutside = new Date(start.getTime() - 60000);

      await sale(shopBId, 700, justInside);
      await sale(shopBId, 900, justOutside);

      const res = await grid(ownerToken, `?from=${PREV_MONTH}&to=${MONTH}`);

      expect(Number(cellIn(res.body, shopBId, MONTH).sales)).toBe(700);
      expect(Number(cellIn(res.body, shopBId, PREV_MONTH).sales)).toBe(900);
    });
  });

  describe('trend, for requirement 15', () => {
    // "Know by looking where more effort is needed" — a branch that earned
    // 1,55,000 last month and 13,000 this month has to be visible as declining
    // without anybody reading the two numbers.
    it('marks a branch whose net profit fell as declining', async () => {
      const res = await grid(ownerToken, `?from=${PREV_MONTH}&to=${MONTH}`);
      const row = branchIn(res.body, shopAId);

      expect(row.trend.direction).toBe('DOWN');
      expect(Number(row.trend.changePercent)).toBeLessThan(0);
      expect(row.trend.comparable).toBe(true);
    });

    it('states no percentage when the earlier month was zero', async () => {
      const res = await grid(ownerToken, `?from=${PREV_MONTH}&to=${MONTH}`);
      const row = branchIn(res.body, warehouseId);

      // Nothing was recorded against the warehouse in the earlier month, so the
      // fall to -55,000 is a direction with no proportion to express.
      expect(row.trend.direction).toBe('DOWN');
      expect(row.trend.changePercent).toBeNull();
    });
  });

  describe('payroll that has not been settled', () => {
    it('flags a month whose branch has staff and no payslips', async () => {
      const res = await grid(ownerToken, `?from=${PREV_MONTH}&to=${MONTH}`);

      // The warehouse has a loader and a payslip only for MONTH.
      expect(cellIn(res.body, warehouseId, PREV_MONTH).payrollProvisional).toBe(true);
      expect(cellIn(res.body, warehouseId, MONTH).payrollProvisional).toBe(false);
    });

    it('counts a DRAFT payslip and says the figure is provisional', async () => {
      const draftMonth = monthKeyMinus(thisMonthKeyInZone(ZONE), 4);
      await payslip(staffOfA.id, shopAId, draftMonth, 41000, 'DRAFT');

      const res = await grid(ownerToken, `?from=${draftMonth}&to=${draftMonth}`);
      const cell = cellIn(res.body, shopAId, draftMonth);

      expect(Number(cell.payroll)).toBe(41000);
      expect(cell.payrollProvisional).toBe(true);
    });
  });

  describe('who may read what', () => {
    // The same endpoint, scoped by the branch access the role already has. A
    // cashier holds analytics:viewBranch and not analytics:viewBusiness, so they
    // see their branch and are not handed the business's net profit alongside it.
    it('gives a cashier their own branch and no business roll-up', async () => {
      const res = await grid(cashierToken, `?from=${MONTH}&to=${MONTH}`);
      expect(res.statusCode).toBe(200);

      expect(res.body.branches).toHaveLength(1);
      expect(res.body.branches[0].branchId).toBe(shopAId);
      expect(res.body.business).toBeNull();
    });

    it('refuses a branch the caller cannot reach', async () => {
      const res = await grid(cashierToken, `?from=${MONTH}&to=${MONTH}&branchId=${shopBId}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('refuses a role with no analytics capability at all', async () => {
      const res = await grid(staffToken, `?from=${MONTH}&to=${MONTH}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('the window', () => {
    it('defaults to the current month and the five before it', async () => {
      const res = await grid(ownerToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.months).toHaveLength(6);
      expect(res.body.to).toBe(thisMonthKeyInZone(ZONE));
    });

    it('refuses a window that ends before it starts', async () => {
      const res = await grid(ownerToken, `?from=${MONTH}&to=${PREV_MONTH}`);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('ANALYTICS_RANGE_REVERSED');
    });

    it('refuses a window longer than the ceiling', async () => {
      const res = await grid(ownerToken, `?from=2020-01&to=${MONTH}`);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('ANALYTICS_RANGE_TOO_LONG');
    });

    it('rejects a month that is not a month', async () => {
      const res = await grid(ownerToken, '?from=2026-13');
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details[0]).toMatchObject({ code: 'FIELD_MUST_BE_MONTH', field: 'from' });
    });
  });

  // A business created a minute ago, before anyone has added a branch to it.
  // The shape must be the full one with zeroes, not a partial object: the app's
  // types promise a total with every field, and reading `undefined` off one is a
  // blank card rather than an empty report.
  describe('a business with no branches yet', () => {
    it('returns a complete report of zeroes rather than a partial one', async () => {
      const created = await request(app)
        .post('/api/businesses')
        .set(auth(ownerToken))
        .send({
          name: `Analytics Empty Business ${RUN_ID}`,
          industry: 'RETAIL',
          country: 'IN',
          defaultCurrency: 'INR',
          timezone: ZONE,
        });
      expect(created.statusCode).toBe(201);
      businessIdsToClean.push(created.body.business.id);

      const res = await request(app)
        .get(`/api/businesses/${created.body.business.id}/analytics/branch-monthly?from=${MONTH}&to=${MONTH}`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      expect(res.body.branches).toEqual([]);
      expect(res.body.business.total).toMatchObject({
        customerSales: expect.anything(),
        expenses: expect.anything(),
        payroll: expect.anything(),
        internalTransfer: expect.anything(),
        netProfit: expect.anything(),
        payrollProvisional: false,
      });
      expect(Number(res.body.business.total.netProfit)).toBe(0);
      expect(res.body.business.months).toHaveLength(1);
      expect(res.body.business.reconciliation.balances).toBe(true);
    });
  });

  // Requirement 16 gave one account several businesses; requirement 13 asks its
  // holder to see across them. Totals only — a business's branches are read by
  // opening that business's own grid.
  describe('across businesses', () => {
    it("lists every business the caller can read, and omits the ones they cannot", async () => {
      const res = await request(app)
        .get(`/api/analytics/cross-business?from=${MONTH}&to=${MONTH}`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      const mine = res.body.businesses.find((business) => business.businessId === businessId);
      expect(mine).toBeTruthy();

      // Asserted against that business's OWN grid for the same window rather
      // than against a literal, which proves the thing actually worth proving —
      // the two endpoints agree — and does not break when a test above adds a
      // row to the fixture.
      const own = await grid(ownerToken, `?from=${MONTH}&to=${MONTH}`);
      expect(Number(mine.total.netProfit)).toBe(Number(own.body.business.total.netProfit));
      expect(Number(mine.total.customerSales)).toBe(Number(own.body.business.total.customerSales));
      expect(mine.reconciliation.balances).toBe(true);
      expect(mine.branchCount).toBe(3);
      expect(mine.tradingBranchCount).toBe(2);
      // No per-branch rows: "amount only, like standard values".
      expect(mine.branches).toBeUndefined();
    });

    // Every business must be asked about the SAME months. Each one defaulting an
    // omitted window from its own first branch's timezone would compare a
    // business in Auckland's October against one in Kolkata's September on the
    // day they disagree, and label both with the first one's months.
    it('asks every business for one shared window when none is given', async () => {
      const res = await request(app).get('/api/analytics/cross-business').set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      expect(res.body.from).toBeTruthy();
      expect(res.body.to).toBeTruthy();

      for (const business of res.body.businesses) {
        expect(business.from).toBe(res.body.from);
        expect(business.to).toBe(res.body.to);
        expect(business.months.map((cell) => cell.month)).toEqual(
          res.body.businesses[0].months.map((cell) => cell.month)
        );
      }
    });

    it('omits a business where the caller is only a cashier', async () => {
      const res = await request(app)
        .get(`/api/analytics/cross-business?from=${MONTH}&to=${MONTH}`)
        .set(auth(cashierToken));
      expect(res.statusCode).toBe(200);

      expect(res.body.businesses.every((business) => business.businessId !== businessId)).toBe(true);
    });
  });
});
