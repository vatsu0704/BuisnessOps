const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const { tenantCan } = require('../permissions');
const { accessState } = require('../billing/access');
const {
  dateOnly,
  dateKeyOf,
  daysInMonth,
  isRealMonthKey,
  safeZone,
  localMonthRange,
  eachMonthBetween,
  monthsBetween,
  monthKeyMinus,
  thisMonthKeyInZone,
} = require('../utils/datetime');

/**
 * Branch × month analytics and net profit — requirements 13 and 15.
 *
 * "For admin login he can see all branch data — amount only — and show the final
 * net profit too." / "Manager and admin should see all of this so that they know
 * by looking where more effort is needed — all months' data, branch-wise."
 *
 * Nothing here writes. It is the one read-only service in the backend, and every
 * figure it returns is a sum over rows the other services created — which is the
 * whole acceptance criterion for requirement 13: *net profit must be reproducible
 * by hand from the rows behind it.* No number is derived from another derived
 * number, and none is cached.
 *
 * ## The formula
 *
 *     netProfit = sales − expenses − materialSpend − payroll
 *
 * for every branch, with no special case for a warehouse: a warehouse has no
 * till and orders no raw material from itself, so its `sales` and
 * `materialSpend` are structurally zero and the same expression collapses to
 * `−(expenses + payroll)`. One formula, and `isCostCentre` exists only so the
 * screen can print "cost centre" instead of a misleading ₹0 of sales.
 *
 * ## Why the branch column does not add up to the business total
 *
 * This is the part worth reading before changing anything here.
 *
 * When a shop orders flour from the warehouse, the shop pays the warehouse. That
 * is real money out of *that branch*, so `materialSpend` is subtracted from the
 * shop's row and a branch manager sees their true cost. But the money never left
 * the **business** — it moved from one pocket to another. Subtracting it from the
 * business total as well would count an internal transfer as a loss, and the
 * business would appear to lose money every time it supplied itself.
 *
 * So the business roll-up subtracts expenses and payroll across every branch
 * (warehouses included — that is where the flour was bought from the outside
 * world, logged as an ordinary expense) and does **not** subtract material
 * spend. The two levels therefore differ, on purpose, by exactly the internal
 * transfer:
 *
 *     Σ(branch netProfit) + internalTransfer === business netProfit
 *
 * That identity is asserted in `tests/analytics.test.js`, and `reconciliation`
 * in the response states it in full so the screen can show its own arithmetic
 * rather than asking anyone to take the totals on trust. Hiding the gap would be
 * the bug: someone adds the column up, gets a different number from the total,
 * and stops believing either.
 *
 * The alternative — crediting the transfer to the warehouse as revenue so the
 * column simply adds up — was considered and rejected for now: `SupplyOrder`
 * records the branch that *ordered* and has no column for the warehouse that
 * filled it, so the revenue could not be attributed to a particular warehouse
 * without a schema change. See §5 of Docs/REQUIREMENTS.md.
 *
 * ## Vendor orders are NOT an internal transfer (requirement 25)
 *
 * Raw material bought from a third-party vendor goes to somebody outside the
 * business. It is still the ordering branch's cost — so it stays inside that
 * branch's `materialSpend` — but unlike a warehouse order it really did leave
 * the business, so the business roll-up subtracts it too, as `vendorSpend`.
 * `internalTransfer` is therefore the WAREHOUSE part of material spend only,
 * and the identity above still holds term for term:
 *
 *     Σ(branch netProfit) = sales − expenses − payroll − (warehouse + vendor)
 *     business netProfit = sales − expenses − payroll − vendor
 *
 * Who pays (requirement 24) changes nothing here. A company-operated branch's
 * order paid by accounts is still that branch's material cost, and is counted
 * from `placedAt` exactly like one the branch paid for itself.
 *
 * ## Which queries this runs
 *
 * Bounded by the number of **months** asked for, never by the number of
 * branches — the thing that grows as a franchise grows must not multiply the
 * query count:
 *
 * - expenses: **1** — `expenseDate` is a `@db.Date` already holding the
 *   branch's own calendar day, so a whole window is one range and the month
 *   bucket is a string prefix.
 * - payroll: **1** — `SalarySlip.monthYear` is already 'YYYY-MM'.
 * - staff head-count: **1**.
 * - sales and material spend: **2 per (timezone × month)**. `occurredAt` and
 *   `placedAt` are *instants*, so a branch's September is the window of real
 *   time September occupied at that branch. Branches sharing a timezone share
 *   that window, and in practice a business has one timezone — so a six-month
 *   grid over forty branches is twelve queries, not two hundred and forty.
 */

// A ceiling on the window, so one request cannot ask for a decade of months and
// turn the bounded-by-months property above into a bounded-by-nothing property.
const MAX_MONTHS = 24;

/** What the grid shows when nobody says otherwise: this month and the five before it. */
const DEFAULT_MONTHS = 6;

/**
 * Below this, a change month-on-month is noise rather than a trend.
 *
 * Requirement 15 asks that declining branches be visible *without reading every
 * number*, which means the flag has to mean something — a branch marked as
 * declining because it moved 0.4% teaches the reader to ignore the marks.
 */
const FLAT_THRESHOLD_PERCENT = 2;

/** Statuses that represent money a branch has committed to spending. */
const SPENDING_SUPPLY_STATUSES = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED'];

function zero() {
  return new Prisma.Decimal(0);
}

function toDecimal(value) {
  return new Prisma.Decimal(value ?? 0);
}

function monthOf(dateKey) {
  return String(dateKey).slice(0, 7);
}

// --- The window ------------------------------------------------------------

/**
 * Resolve and bound the requested window.
 *
 * Defaults are computed in the **business's** timezone rather than the server's,
 * taken from its first branch, so "this month" means the month the business is
 * actually in. A window whose end precedes its start is a mistake worth naming
 * rather than an empty grid that looks like an absence of data.
 */
function resolveWindow({ from, to }, timeZone) {
  const thisMonth = thisMonthKeyInZone(timeZone);
  const end = to || thisMonth;
  const start = from || monthKeyMinus(end, DEFAULT_MONTHS - 1);

  if (monthsBetween(start, end) < 0) throw fail('ANALYTICS_RANGE_REVERSED', 400);
  if (monthsBetween(start, end) + 1 > MAX_MONTHS) {
    throw fail('ANALYTICS_RANGE_TOO_LONG', 400, { max: MAX_MONTHS });
  }

  return { from: start, to: end, months: eachMonthBetween(start, end) };
}

// --- The four cost and revenue reads ---------------------------------------

/**
 * Expenses per branch per month, in one query.
 *
 * `expenseDate` is branch-local by construction (see the schema note on
 * `Expense`), so no timezone work is needed here at all — only sales do.
 */
async function expensesByBranchMonth(businessId, branchIds, months) {
  const rows = await expenseRows(businessId, branchIds, `${months[0]}-01`, `${nextMonthKey(months[months.length - 1])}-01`);
  const totals = new Map();
  for (const row of rows) {
    const key = `${row.branchId}|${monthOf(row.dayKey)}`;
    totals.set(key, addExpense(totals.get(key), row));
  }
  return totals;
}

/**
 * The business's expenses between two dates, a row per branch, day and category,
 * each carrying its category's cost type (requirement 34). The type is read from
 * the category now, never stored on the expense, so re-classing a category
 * re-sorts every month's split and changes no total.
 */
async function expenseRows(businessId, branchIds, fromKey, toKeyExclusive) {
  const [rows, categories] = await Promise.all([
    prisma.expense.groupBy({
      by: ['branchId', 'expenseDate', 'categoryId'],
      where: {
        businessId,
        branchId: { in: branchIds },
        expenseDate: { gte: dateOnly(fromKey), lt: dateOnly(toKeyExclusive) },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expenseCategory.findMany({ where: { businessId }, select: { id: true, costType: true } }),
  ]);
  const typeOf = new Map(categories.map((category) => [category.id, category.costType]));
  return rows.map((row) => ({
    branchId: row.branchId,
    dayKey: dateKeyOf(row.expenseDate),
    costType: typeOf.get(row.categoryId) ?? 'DAILY',
    amount: toDecimal(row._sum.amount),
    count: row._count,
  }));
}

/** Fold one expense row into a running total split by cost type. */
function addExpense(existing, row) {
  const total = existing ?? { amount: zero(), count: 0, variable: zero(), fixed: zero(), daily: zero() };
  return {
    amount: total.amount.plus(row.amount),
    count: total.count + row.count,
    variable: row.costType === 'VARIABLE' ? total.variable.plus(row.amount) : total.variable,
    fixed: row.costType === 'FIXED' ? total.fixed.plus(row.amount) : total.fixed,
    daily: row.costType === 'DAILY' ? total.daily.plus(row.amount) : total.daily,
  };
}

const NO_EXPENSE = () => ({ amount: zero(), count: 0, variable: zero(), fixed: zero(), daily: zero() });

function nextMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Payroll per branch per month, in one query, plus whether it is settled.
 *
 * Counts DRAFT slips as well as FINALIZED ones. A business that generates
 * payslips but never finalises them would otherwise report zero payroll and a
 * wildly inflated profit — the more dangerous of the two wrong answers, because
 * it is wrong in the flattering direction. `provisional` is how the screen says
 * so out loud instead.
 */
async function payrollByBranchMonth(businessId, branchIds, months) {
  const rows = await prisma.salarySlip.groupBy({
    by: ['branchId', 'monthYear', 'status'],
    where: { businessId, branchId: { in: branchIds }, monthYear: { in: months } },
    _sum: { netPay: true },
    _count: true,
  });

  const totals = new Map();
  for (const row of rows) {
    const key = `${row.branchId}|${row.monthYear}`;
    const existing = totals.get(key) ?? { amount: zero(), slipCount: 0, draftCount: 0 };
    totals.set(key, {
      amount: existing.amount.plus(toDecimal(row._sum.netPay)),
      slipCount: existing.slipCount + row._count,
      draftCount: existing.draftCount + (row.status === 'DRAFT' ? row._count : 0),
    });
  }
  return totals;
}

/** ACTIVE staff per branch — only used to decide whether "no payslips" is suspicious. */
async function staffCountByBranch(businessId, branchIds) {
  const rows = await prisma.staffMember.groupBy({
    by: ['branchId'],
    where: { businessId, branchId: { in: branchIds }, status: 'ACTIVE' },
    _count: true,
  });
  return new Map(rows.map((row) => [row.branchId, row._count]));
}

/**
 * Sales and material spend per branch per month, grouped by timezone.
 *
 * Both columns are instants, so both need the branch's own month window. The
 * branches are bucketed by timezone first because branches sharing one share
 * every window boundary — which is what keeps this at two queries per month
 * rather than two per branch per month.
 */
async function instantMetricsByBranchMonth(businessId, branches, months) {
  const byZone = new Map();
  for (const branch of branches) {
    const zone = safeZone(branch.timezone);
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(branch.id);
  }

  const sales = new Map();
  const material = new Map();
  // The part of `material` that went to a vendor rather than the warehouse —
  // money that left the business. See the header.
  const vendorMaterial = new Map();

  for (const [zone, zoneBranchIds] of byZone) {
    for (const month of months) {
      const { start, end } = localMonthRange(month, zone);

      const [saleRows, materialRows] = await Promise.all([
        prisma.transaction.groupBy({
          by: ['branchId'],
          where: {
            businessId,
            branchId: { in: zoneBranchIds },
            // Matches getSalesSummary: a REFUNDED or VOIDED transaction is not
            // a sale. A voided counter order lands here through exactly this
            // filter, which is why voiding one needed no code in this service.
            status: 'COMPLETED',
            occurredAt: { gte: start, lt: end },
          },
          _sum: { totalAmount: true },
          _count: true,
        }),
        prisma.supplyOrder.groupBy({
          // By supplier as well, so the vendor share can be told apart from the
          // warehouse's. Still one query: a branch orders from a handful of
          // suppliers, not from hundreds.
          by: ['branchId', 'vendorId'],
          where: {
            businessId,
            branchId: { in: zoneBranchIds },
            // A DRAFT is a cart nobody has committed to and a CANCELLED order
            // is money that was never spent. Everything else is a liability the
            // branch has taken on, which is why this is keyed on `placedAt`
            // rather than `deliveredAt`: attributing it to delivery would drop
            // every order still in flight out of the figures entirely, and move
            // an order placed in September and delivered in October into the
            // wrong month.
            status: { in: SPENDING_SUPPLY_STATUSES },
            placedAt: { gte: start, lt: end },
          },
          _sum: { totalAmount: true },
          _count: true,
        }),
      ]);

      for (const row of saleRows) {
        sales.set(`${row.branchId}|${month}`, {
          amount: toDecimal(row._sum.totalAmount),
          count: row._count,
        });
      }
      for (const row of materialRows) {
        const key = `${row.branchId}|${month}`;
        const amount = toDecimal(row._sum.totalAmount);
        const existing = material.get(key) ?? { amount: zero(), count: 0 };
        material.set(key, { amount: existing.amount.plus(amount), count: existing.count + row._count });
        if (row.vendorId) {
          vendorMaterial.set(key, (vendorMaterial.get(key) ?? zero()).plus(amount));
        }
      }
    }
  }

  return { sales, material, vendorMaterial };
}

// --- Trend (requirement 15) ------------------------------------------------

/**
 * Which way a branch is moving, from the last two months in the window.
 *
 * Measured against the **magnitude** of the earlier month, so a loss that halves
 * reads as an improvement rather than as a further decline: −100 → −50 is +50%.
 * When the earlier month is zero there is no percentage to state — a change from
 * nothing is not a proportion — so the direction is given and `changePercent` is
 * null rather than a fabricated infinity.
 */
function trendOf(cells) {
  if (cells.length < 2) return { direction: 'FLAT', changePercent: null, comparable: false };

  const previous = cells[cells.length - 2].netProfit;
  const latest = cells[cells.length - 1].netProfit;
  const delta = latest.minus(previous);

  if (previous.isZero()) {
    return {
      direction: delta.isZero() ? 'FLAT' : delta.isPositive() ? 'UP' : 'DOWN',
      changePercent: null,
      comparable: !delta.isZero(),
    };
  }

  const changePercent = delta.dividedBy(previous.abs()).times(100);
  const direction = changePercent.abs().lessThan(FLAT_THRESHOLD_PERCENT)
    ? 'FLAT'
    : changePercent.isPositive()
      ? 'UP'
      : 'DOWN';

  return { direction, changePercent, comparable: true };
}

// --- Assembly --------------------------------------------------------------

/** The money fields a branch cell carries, all summed the same way. */
const BRANCH_MONEY = [
  'sales',
  'expenses',
  'expenseVariable',
  'expenseFixed',
  'expenseDaily',
  'materialSpend',
  'vendorSpend',
  'payroll',
  'variableExpenses',
  'fixedExpenses',
  'dailyExpenses',
  'totalCost',
  'netProfit',
];

function emptyTotals() {
  return {
    ...Object.fromEntries(BRANCH_MONEY.map((field) => [field, zero()])),
    saleCount: 0,
    expenseCount: 0,
    materialOrderCount: 0,
  };
}

function addInto(totals, cell) {
  for (const field of BRANCH_MONEY) totals[field] = totals[field].plus(cell[field]);
  totals.saleCount += cell.saleCount;
  totals.expenseCount += cell.expenseCount;
  totals.materialOrderCount += cell.materialOrderCount;
  return totals;
}

/**
 * Requirement 34's three kinds of cost, at a branch.
 *
 * - **Variable** rises and falls with sales: the variable expense categories and
 *   every rupee of raw material the branch ordered (warehouse or vendor alike —
 *   to the branch, both are money out).
 * - **Fixed** is the same month after month: the fixed categories and wages.
 * - **Daily** is the day-to-day rest.
 *
 * The three add up to the branch's total cost, and net profit is what it always
 * was — sales less that cost — so nothing about the arithmetic moved, only how
 * the cost is shown.
 */
function splitCosts(cell, { materialSpend, payroll }) {
  cell.variableExpenses = cell.expenseVariable.plus(materialSpend);
  cell.fixedExpenses = cell.expenseFixed.plus(payroll);
  cell.dailyExpenses = cell.expenseDaily;
  cell.totalCost = cell.variableExpenses.plus(cell.fixedExpenses).plus(cell.dailyExpenses);
  return cell;
}

/**
 * The branch × month grid, with the business roll-up beside it.
 *
 * `accessibleBranchIds` is `req.branchAccess`: null for a role holding
 * `branch:allAccess`, otherwise the explicit list. A cashier therefore gets this
 * same endpoint scoped to their own branch without a second one existing.
 *
 * `includeBusiness` is driven by `analytics:viewBusiness`, not by the branch
 * scope — a cashier reading their own branch's grid must not be handed the
 * business's total profit as a side effect.
 */
async function getBranchMonthly(
  businessId,
  { from, to, branchId = null, accessibleBranchIds = null, includeBusiness = false } = {}
) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw fail('BUSINESS_NOT_FOUND', 404);

  const where = { businessId };
  // Every branch, not only ACTIVE ones: a branch closed last month still earned
  // what it earned, and dropping it would silently restate the history of every
  // month before it closed.
  if (accessibleBranchIds !== null) where.id = { in: accessibleBranchIds };
  if (branchId) {
    if (accessibleBranchIds !== null && !accessibleBranchIds.includes(branchId)) {
      throw fail('BRANCH_ACCESS_DENIED', 403);
    }
    where.id = branchId;
  }

  const branches = await prisma.branch.findMany({ where, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });

  const window = resolveWindow(
    { from, to },
    safeZone(branches[0]?.timezone, 'UTC')
  );
  const { months } = window;

  if (branches.length === 0) {
    return {
      ...window,
      currency: business.defaultCurrency,
      mixedCurrency: false,
      branches: [],
      business: includeBusiness ? emptyBusinessRollUp(months) : null,
    };
  }

  const branchIds = branches.map((branch) => branch.id);
  const [expenses, payroll, staffCounts, instant] = await Promise.all([
    expensesByBranchMonth(businessId, branchIds, months),
    payrollByBranchMonth(businessId, branchIds, months),
    staffCountByBranch(businessId, branchIds),
    instantMetricsByBranchMonth(businessId, branches, months),
  ]);

  const rows = branches.map((branch) => {
    const staffCount = staffCounts.get(branch.id) ?? 0;

    const cells = months.map((month) => {
      const key = `${branch.id}|${month}`;
      const expense = expenses.get(key) ?? NO_EXPENSE();
      const pay = payroll.get(key) ?? { amount: zero(), slipCount: 0, draftCount: 0 };
      const sale = instant.sales.get(key) ?? { amount: zero(), count: 0 };
      const material = instant.material.get(key) ?? { amount: zero(), count: 0 };

      const cell = {
        month,
        sales: sale.amount,
        saleCount: sale.count,
        expenses: expense.amount,
        expenseCount: expense.count,
        expenseVariable: expense.variable,
        expenseFixed: expense.fixed,
        expenseDaily: expense.daily,
        materialSpend: material.amount,
        materialOrderCount: material.count,
        // Already inside `materialSpend` — reported beside it, never subtracted
        // twice. The branch's own net profit is unaffected by who supplied it.
        vendorSpend: instant.vendorMaterial.get(key) ?? zero(),
        payroll: pay.amount,
        payrollSlipCount: pay.slipCount,
        // Either some slip is still a draft, or the branch has staff and no
        // slips were generated at all. The second case is why this is not simply
        // `draftCount > 0`: a month nobody has run payroll for reports ₹0 of
        // wages, which is a number somebody would otherwise believe.
        //
        // It reads the head-count as it stands *today*, so a branch that has
        // taken someone on since a long-closed month will see that month flagged
        // too. That errs toward "go and look", which is the safe direction.
        payrollProvisional: pay.draftCount > 0 || (pay.slipCount === 0 && staffCount > 0),
        netProfit: zero(),
      };

      splitCosts(cell, { materialSpend: cell.materialSpend, payroll: cell.payroll });
      cell.netProfit = cell.sales.minus(cell.expenses).minus(cell.materialSpend).minus(cell.payroll);
      return cell;
    });

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code,
      kind: branch.kind,
      status: branch.status,
      timezone: branch.timezone,
      currency: branch.currency ?? business.defaultCurrency,
      // A warehouse has staff, a roster and an electricity bill but no till, so
      // it can only ever cost money. Flagged rather than inferred from
      // `sales === 0`, which is also true of a shop that had a dead month.
      isCostCentre: branch.kind === 'WAREHOUSE',
      staffCount,
      months: cells,
      total: cells.reduce((totals, cell) => addInto(totals, cell), emptyTotals()),
      trend: trendOf(cells),
    };
  });

  const currencies = new Set(rows.map((row) => row.currency));

  return {
    ...window,
    currency: business.defaultCurrency,
    // Summing two currencies would produce a number that means nothing. The
    // figures are still returned per branch; the screen is told not to add them.
    mixedCurrency: currencies.size > 1,
    branches: rows,
    business: includeBusiness ? businessRollUp(rows, months) : null,
  };
}

/**
 * A business with no branches the caller can see — a business created a minute
 * ago, most often.
 *
 * Every field the populated shape carries is present and zero rather than
 * omitted, so the screen renders an empty report instead of reading `undefined`
 * off a total it was promised. `businessRollUp` is not reused for this because it
 * needs rows to iterate, and a zero-row call would produce a `total` with no
 * months behind it.
 */
/** The money fields a business cell carries. */
const BUSINESS_MONEY = [
  'customerSales',
  'expenses',
  'expenseVariable',
  'expenseFixed',
  'expenseDaily',
  'payroll',
  'vendorSpend',
  'internalTransfer',
  'variableExpenses',
  'fixedExpenses',
  'dailyExpenses',
  'totalCost',
  'netProfit',
];

function emptyBusinessCell() {
  return { ...Object.fromEntries(BUSINESS_MONEY.map((field) => [field, zero()])), payrollProvisional: false };
}

function emptyReconciliation() {
  return { branchNetProfitSum: zero(), internalTransfer: zero(), netProfit: zero(), balances: true };
}

function emptyBusinessRollUp(months) {
  return {
    months: months.map((month) => ({ month, ...emptyBusinessCell(), reconciliation: emptyReconciliation() })),
    total: emptyBusinessCell(),
    reconciliation: emptyReconciliation(),
  };
}

/**
 * The business's own split (requirement 34). Variable is the variable expense
 * categories plus what went to VENDORS — not the warehouse transfer, which never
 * left the business (see the header). So Σ branch variable − internal transfer is
 * the business's variable cost, the same identity the net profit keeps.
 */
function businessCosts(cell) {
  cell.variableExpenses = cell.expenseVariable.plus(cell.vendorSpend);
  cell.fixedExpenses = cell.expenseFixed.plus(cell.payroll);
  cell.dailyExpenses = cell.expenseDaily;
  cell.totalCost = cell.variableExpenses.plus(cell.fixedExpenses).plus(cell.dailyExpenses);
  return cell;
}

/**
 * The business's own figures — and the arithmetic that reconciles them with the
 * branch rows above.
 *
 * `internalTransfer` is the money that moved between the business's own
 * locations. It is subtracted from the branch that paid it and from nothing at
 * the business level, which is the entire reason the two levels differ. See the
 * header.
 *
 * `vendorSpend` is the material that did NOT move between the business's own
 * locations: it went to a third-party vendor, so it is subtracted at both
 * levels and is not part of the transfer.
 */
function businessRollUp(rows, months) {
  const cells = months.map((month, index) => {
    const cell = { month, ...emptyBusinessCell() };
    let branchNetProfitSum = zero();

    for (const row of rows) {
      const monthCell = row.months[index];
      cell.customerSales = cell.customerSales.plus(monthCell.sales);
      cell.expenses = cell.expenses.plus(monthCell.expenses);
      cell.expenseVariable = cell.expenseVariable.plus(monthCell.expenseVariable);
      cell.expenseFixed = cell.expenseFixed.plus(monthCell.expenseFixed);
      cell.expenseDaily = cell.expenseDaily.plus(monthCell.expenseDaily);
      cell.payroll = cell.payroll.plus(monthCell.payroll);
      cell.vendorSpend = cell.vendorSpend.plus(monthCell.vendorSpend);
      cell.internalTransfer = cell.internalTransfer.plus(monthCell.materialSpend.minus(monthCell.vendorSpend));
      branchNetProfitSum = branchNetProfitSum.plus(monthCell.netProfit);
      if (monthCell.payrollProvisional) cell.payrollProvisional = true;
    }

    businessCosts(cell);
    cell.netProfit = cell.customerSales.minus(cell.expenses).minus(cell.payroll).minus(cell.vendorSpend);
    // The month's own reconciliation, so a screen showing one month can print the
    // sentence for that month — not the window's, under one month's figure.
    cell.reconciliation = {
      branchNetProfitSum,
      internalTransfer: cell.internalTransfer,
      netProfit: cell.netProfit,
      balances: branchNetProfitSum.plus(cell.internalTransfer).equals(cell.netProfit),
    };
    return cell;
  });

  const total = cells.reduce((totals, cell) => {
    for (const field of BUSINESS_MONEY) totals[field] = totals[field].plus(cell[field]);
    totals.payrollProvisional = totals.payrollProvisional || cell.payrollProvisional;
    return totals;
  }, emptyBusinessCell());

  const branchNetProfitSum = rows.reduce((sum, row) => sum.plus(row.total.netProfit), zero());

  return {
    months: cells,
    total,
    // Stated, not implied. The screen prints this so a reader who adds the
    // branch column up and gets a different number can see immediately why,
    // which is requirement 13's "reproducible by hand" applied to the one place
    // the figures legitimately disagree.
    reconciliation: {
      branchNetProfitSum,
      internalTransfer: total.internalTransfer,
      netProfit: total.netProfit,
      balances: branchNetProfitSum.plus(total.internalTransfer).equals(total.netProfit),
    },
  };
}

// --- Day by day (requirement 34) ---------------------------------------------

/**
 * Sales and raw material per branch per LOCAL day, for one month.
 *
 * Both columns are instants (`TIMESTAMP(3)` holding UTC), so a branch's day has
 * to be worked out from its time zone. The rule in CLAUDE.md — never
 * `occurredAt::date` — is about two things, and this keeps both:
 *
 * - The WHERE is a plain range over the branch's own month (`localMonthRange`),
 *   so the `(businessId, branchId, occurredAt)` index does the filtering.
 * - The bucketing is an explicit conversion into the branch's zone, never a cast
 *   of the UTC value: `AT TIME ZONE 'UTC'` first says the stored value IS UTC,
 *   then `AT TIME ZONE <zone>` gives the wall clock there. One conversion alone
 *   would read the UTC value as if it were Kolkata time and shift it the wrong way.
 *
 * Enum comparisons are written as literals, because a bound text parameter would
 * need a cast against an enum column.
 */
async function instantMetricsByBranchDay(businessId, branches, month) {
  const byZone = new Map();
  for (const branch of branches) {
    const zone = safeZone(branch.timezone);
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(branch.id);
  }

  const sales = new Map();
  const material = new Map();
  const vendorMaterial = new Map();

  for (const [zone, ids] of byZone) {
    const range = localMonthRange(month, zone);
    // The columns are TIMESTAMP without a zone, holding UTC. Bound as naive UTC
    // text and cast, the comparison cannot depend on the database session's zone.
    const start = range.start.toISOString().replace('Z', '');
    const end = range.end.toISOString().replace('Z', '');
    const [saleRows, materialRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT "branchId",
               to_char(("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS day,
               SUM("totalAmount") AS amount,
               COUNT(*)::int AS count
        FROM transactions
        WHERE "businessId" = ${businessId}
          AND "branchId" IN (${Prisma.join(ids)})
          AND status = 'COMPLETED'
          AND "occurredAt" >= ${start}::timestamp AND "occurredAt" < ${end}::timestamp
        GROUP BY 1, 2`,
      prisma.$queryRaw`
        SELECT "branchId",
               to_char(("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS day,
               SUM("totalAmount") AS amount,
               COUNT(*)::int AS count,
               SUM(CASE WHEN "vendorId" IS NOT NULL THEN "totalAmount" ELSE 0 END) AS vendor
        FROM supply_orders
        WHERE "businessId" = ${businessId}
          AND "branchId" IN (${Prisma.join(ids)})
          AND status::text IN (${Prisma.join(SPENDING_SUPPLY_STATUSES)})
          AND "placedAt" >= ${start}::timestamp AND "placedAt" < ${end}::timestamp
        GROUP BY 1, 2`,
    ]);
    for (const row of saleRows) {
      sales.set(`${row.branchId}|${row.day}`, { amount: toDecimal(row.amount), count: Number(row.count) });
    }
    for (const row of materialRows) {
      const key = `${row.branchId}|${row.day}`;
      material.set(key, { amount: toDecimal(row.amount), count: Number(row.count) });
      vendorMaterial.set(key, toDecimal(row.vendor));
    }
  }
  return { sales, material, vendorMaterial };
}

/**
 * A monthly cost spread evenly over the month's days, to the paise, with the
 * remainder on the last day so the days add back up to the month exactly.
 */
function spreadOverDays(total, days) {
  const share = total.times(100).dividedBy(days).floor().dividedBy(100);
  const last = total.minus(share.times(days - 1));
  return { share, last };
}

/**
 * One month, day by day, per branch and for the business — requirement 34's
 * "Per day" view.
 *
 * Variable and daily costs fall on the day they happened. **Fixed costs — the
 * fixed expense categories and wages — are spread evenly over the month's days**,
 * as Vatsal chose (2026-10-14): rent paid on the 1st and wages for the whole
 * month would otherwise make the 1st a disaster and every other day a triumph.
 * Each day says so (`fixedShared`), and the month's days add up to the monthly
 * figures exactly.
 *
 * The business level keeps the monthly identity day by day: Σ branch net profit
 * + the day's internal transfer = the business's net profit that day.
 */
async function getBranchDaily(
  businessId,
  { month, branchId = null, accessibleBranchIds = null, includeBusiness = false } = {}
) {
  if (!isRealMonthKey(month)) throw fail('EXPORT_MONTH_INVALID', 400);
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw fail('BUSINESS_NOT_FOUND', 404);

  const where = { businessId };
  if (accessibleBranchIds !== null) where.id = { in: accessibleBranchIds };
  if (branchId) {
    if (accessibleBranchIds !== null && !accessibleBranchIds.includes(branchId)) {
      throw fail('BRANCH_ACCESS_DENIED', 403);
    }
    where.id = branchId;
  }
  const branches = await prisma.branch.findMany({ where, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });

  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = daysInMonth(monthNumber, year);
  const days = Array.from({ length: dayCount }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);

  if (branches.length === 0) {
    return { month, days, currency: business.defaultCurrency, mixedCurrency: false, branches: [], business: null };
  }

  const branchIds = branches.map((branch) => branch.id);
  const [rows, payroll, staffCounts, instant] = await Promise.all([
    expenseRows(businessId, branchIds, `${month}-01`, `${nextMonthKey(month)}-01`),
    payrollByBranchMonth(businessId, branchIds, [month]),
    staffCountByBranch(businessId, branchIds),
    instantMetricsByBranchDay(businessId, branches, month),
  ]);

  const expenses = new Map();
  const fixedCategoriesByBranch = new Map();
  for (const row of rows) {
    const key = `${row.branchId}|${row.dayKey}`;
    expenses.set(key, addExpense(expenses.get(key), row));
    if (row.costType === 'FIXED') {
      fixedCategoriesByBranch.set(row.branchId, (fixedCategoriesByBranch.get(row.branchId) ?? zero()).plus(row.amount));
    }
  }

  const branchRows = branches.map((branch) => {
    const pay = payroll.get(`${branch.id}|${month}`) ?? { amount: zero(), slipCount: 0, draftCount: 0 };
    const fixedMonth = (fixedCategoriesByBranch.get(branch.id) ?? zero()).plus(pay.amount);
    const { share, last } = spreadOverDays(fixedMonth, dayCount);
    const staffCount = staffCounts.get(branch.id) ?? 0;

    const cells = days.map((day, index) => {
      const key = `${branch.id}|${day}`;
      const expense = expenses.get(key) ?? NO_EXPENSE();
      const sale = instant.sales.get(key) ?? { amount: zero(), count: 0 };
      const material = instant.material.get(key) ?? { amount: zero(), count: 0 };
      const fixedShare = index === dayCount - 1 ? last : share;
      const cell = {
        day,
        sales: sale.amount,
        saleCount: sale.count,
        expenses: expense.amount,
        expenseCount: expense.count,
        expenseVariable: expense.variable,
        expenseDaily: expense.daily,
        materialSpend: material.amount,
        vendorSpend: instant.vendorMaterial.get(key) ?? zero(),
        variableExpenses: expense.variable.plus(material.amount),
        fixedExpenses: fixedShare,
        dailyExpenses: expense.daily,
      };
      cell.totalCost = cell.variableExpenses.plus(cell.fixedExpenses).plus(cell.dailyExpenses);
      cell.netProfit = cell.sales.minus(cell.totalCost);
      return cell;
    });

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code,
      kind: branch.kind,
      status: branch.status,
      currency: branch.currency ?? business.defaultCurrency,
      isCostCentre: branch.kind === 'WAREHOUSE',
      // What was spread: the month's fixed categories and wages.
      fixedMonth,
      payrollProvisional: pay.draftCount > 0 || (pay.slipCount === 0 && staffCount > 0),
      days: cells,
    };
  });

  const currencies = new Set(branchRows.map((row) => row.currency));

  let businessDays = null;
  if (includeBusiness) {
    businessDays = days.map((day, index) => {
      const cell = {
        day,
        customerSales: zero(),
        saleCount: 0,
        expenseVariable: zero(),
        dailyExpenses: zero(),
        fixedExpenses: zero(),
        vendorSpend: zero(),
        internalTransfer: zero(),
      };
      let branchNetProfitSum = zero();
      for (const row of branchRows) {
        const branchCell = row.days[index];
        cell.customerSales = cell.customerSales.plus(branchCell.sales);
        cell.saleCount += branchCell.saleCount;
        cell.expenseVariable = cell.expenseVariable.plus(branchCell.expenseVariable);
        cell.dailyExpenses = cell.dailyExpenses.plus(branchCell.dailyExpenses);
        cell.fixedExpenses = cell.fixedExpenses.plus(branchCell.fixedExpenses);
        cell.vendorSpend = cell.vendorSpend.plus(branchCell.vendorSpend);
        cell.internalTransfer = cell.internalTransfer.plus(branchCell.materialSpend.minus(branchCell.vendorSpend));
        branchNetProfitSum = branchNetProfitSum.plus(branchCell.netProfit);
      }
      cell.variableExpenses = cell.expenseVariable.plus(cell.vendorSpend);
      cell.totalCost = cell.variableExpenses.plus(cell.fixedExpenses).plus(cell.dailyExpenses);
      cell.netProfit = cell.customerSales.minus(cell.totalCost);
      cell.reconciliation = {
        branchNetProfitSum,
        internalTransfer: cell.internalTransfer,
        netProfit: cell.netProfit,
        balances: branchNetProfitSum.plus(cell.internalTransfer).equals(cell.netProfit),
      };
      return cell;
    });
  }

  return {
    month,
    days,
    currency: business.defaultCurrency,
    mixedCurrency: currencies.size > 1,
    branches: branchRows,
    business: businessDays ? { days: businessDays, payrollProvisional: branchRows.some((row) => row.payrollProvisional) } : null,
  };
}

// --- Across businesses (requirements 13 and 16) -----------------------------

/**
 * Every business this person can read, side by side.
 *
 * Requirement 16 made one account hold several businesses; requirement 13 asks
 * that its holder see "all branch data — amount only". So this is deliberately
 * **totals only**: each business's monthly figures and its net profit, with no
 * per-branch rows. Someone who wants a particular business's branches opens that
 * business's grid, which is the endpoint above.
 *
 * Not mounted under `/businesses/:businessId`, because it spans them and there is
 * no single tenant to resolve. Authorisation is therefore done here, per
 * membership, off the same matrix `requirePermission` reads — a business where
 * this person is only a CASHIER is simply absent from the list rather than
 * refused, because they did not ask for it by name.
 *
 * Currencies are never added together. When they differ, every business still
 * reports its own total and the combined figure is withheld rather than summed
 * into a number that means nothing.
 */
/**
 * One window for every business being compared.
 *
 * With both ends given there is nothing to resolve. With either missing, the
 * default is anchored to the timezone of the **first** readable business that has
 * a branch — an arbitrary choice, but arbitrary and *shared* beats each business
 * picking its own, which is the bug this exists to prevent.
 */
async function resolveCrossBusinessWindow(readable, { from, to }) {
  if (from && to) return { from, to };

  const branch = readable.length
    ? await prisma.branch.findFirst({
        where: { businessId: { in: readable.map((membership) => membership.businessId) } },
        orderBy: { createdAt: 'asc' },
        select: { timezone: true },
      })
    : null;

  const resolved = resolveWindow({ from, to }, safeZone(branch?.timezone, 'UTC'));
  return { from: resolved.from, to: resolved.to };
}

async function getCrossBusiness(userId, { from, to } = {}) {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { business: { include: { subscription: true } } },
    orderBy: { business: { name: 'asc' } },
  });

  // Role AND plan, as resolveTenant would answer for each business on its own:
  // a business whose plan does not include the cross-branch view (requirement
  // 28) is left out of the comparison rather than shown through a side door.
  const readable = memberships.filter((membership) =>
    tenantCan(
      { role: membership.role, plan: accessState(membership.business.subscription).plan },
      'analytics:viewBusiness'
    )
  );

  // **Resolved once, here, and passed down as concrete months.**
  //
  // `getBranchMonthly` defaults an omitted window from its own business's first
  // branch, which is right when one business is being read and wrong the moment
  // several are compared: a business in Auckland rolls into a new month some
  // seventeen hours before one in Kolkata, so on that day the two would resolve
  // *different* six-month windows. Every row would then be labelled with the
  // first business's months while holding another's, and the combined total
  // would add September to October. Passing explicit months makes every business
  // answer the same question.
  const window = await resolveCrossBusinessWindow(readable, { from, to });

  const businesses = [];
  for (const membership of readable) {
    // Sequential on purpose: each call already fans out internally, and running
    // every business's fan-out at once would multiply the peak connection count
    // by the number of businesses for no gain a person would notice.
    const grid = await getBranchMonthly(membership.businessId, {
      from: window.from,
      to: window.to,
      accessibleBranchIds: null,
      includeBusiness: true,
    });

    businesses.push({
      businessId: membership.businessId,
      businessName: membership.business.name,
      role: membership.role,
      currency: grid.currency,
      mixedCurrency: grid.mixedCurrency,
      branchCount: grid.branches.length,
      tradingBranchCount: grid.branches.filter((branch) => !branch.isCostCentre).length,
      from: grid.from,
      to: grid.to,
      months: grid.business.months,
      total: grid.business.total,
      reconciliation: grid.business.reconciliation,
    });
  }

  const currencies = new Set(businesses.map((business) => business.currency));
  const comparable = currencies.size <= 1;

  return {
    // The window every business was asked for, not whatever the first row
    // happened to resolve.
    from: window.from,
    to: window.to,
    businessCount: businesses.length,
    currency: comparable ? (businesses[0]?.currency ?? null) : null,
    // False when the businesses do not share a currency, which is when the
    // combined figure below is withheld.
    comparable,
    // Every money field a business total has, the cost split included, so the
    // combined row reads the same as each business's own.
    combined: comparable && businesses.length
      ? Object.fromEntries(
          BUSINESS_MONEY.map((field) => [
            field,
            businesses.reduce((sum, business) => sum.plus(business.total[field]), zero()),
          ])
        )
      : null,
    businesses,
  };
}

module.exports = {
  MAX_MONTHS,
  DEFAULT_MONTHS,
  FLAT_THRESHOLD_PERCENT,
  SPENDING_SUPPLY_STATUSES,
  getBranchMonthly,
  getBranchDaily,
  getCrossBusiness,
};
