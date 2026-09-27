const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const {
  dateOnly,
  dateKeyOf,
  safeZone,
  localDayRange,
  localMonthRange,
  todayKeyInZone,
  thisMonthKeyInZone,
  isRealMonthKey,
} = require('../utils/datetime');

/**
 * Day-end and month-end export — requirement 17.
 *
 * "Whatever entries were made across the whole day, they should be able to export
 * it in the evening — and for the whole month too."
 *
 * Like `analytics.service.js` this only reads, and for the same reason: an export
 * is a statement about what was entered, so it has to be re-derivable from the
 * rows at any later date. Nothing is snapshotted, which is what makes
 * "exports work for any past date, so losing the file is recoverable" true by
 * construction rather than by a retention policy.
 *
 * ## Four record types, two date shapes
 *
 * Counter orders, expenses and attendance are keyed on `@db.Date` columns that
 * already hold the branch's own calendar day, so a day is a single value and a
 * month is a plain range. Supply orders are keyed on `placedAt`, an *instant*, so
 * they need the branch's own window — `localDayRange` / `localMonthRange`. Getting
 * this wrong is silent: in IST a UTC-keyed query files everything before 05:30
 * against the day before, so an export run at 20:00 would omit the morning.
 *
 * ## Every branch is asked about its own day
 *
 * A business with branches in two timezones has no single "today". With no date
 * given, each branch is asked about *its* local date; with one given, every
 * branch is asked about that date, which is what makes "what happened on Tuesday"
 * answerable. This is the same rule `listExpenseCompliance` follows.
 *
 * ## The double-count flag
 *
 * §5 of REQUIREMENTS.md left one thing for this task. The seeded expense
 * categories deliberately contain no raw-material category, so supply spend
 * cannot normally be logged twice — but a business may add a category of its own
 * and call it anything. Rather than guess from the wording, which is untranslatable
 * and would produce nonsense, this flags **evidence**: an expense in a custom
 * category whose amount exactly matches a supply order on the same branch and the
 * same day. That is a fact about two rows, not an opinion about a name.
 */

function zero() {
  return new Prisma.Decimal(0);
}

function toDecimal(value) {
  return new Prisma.Decimal(value ?? 0);
}

function sumOf(rows, field = 'totalAmount') {
  return rows.reduce((total, row) => total.plus(toDecimal(row[field])), zero());
}

/** Statuses that represent money actually committed — matches analytics.service.js. */
const SPENDING_SUPPLY_STATUSES = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED'];

// --- Scope -----------------------------------------------------------------

/**
 * Which branches this export covers.
 *
 * `branchId` omitted means every branch the caller can reach, which is what makes
 * "whatever entries were made across the whole day" mean the business rather than
 * one till. A cashier reaching for it gets their own branch, because
 * `accessibleBranchIds` already says so — no separate endpoint needed.
 */
async function branchesFor(businessId, { branchId, accessibleBranchIds }) {
  const where = { businessId };
  if (accessibleBranchIds !== null) where.id = { in: accessibleBranchIds };

  if (branchId) {
    if (accessibleBranchIds !== null && !accessibleBranchIds.includes(branchId)) {
      throw fail('BRANCH_ACCESS_DENIED', 403);
    }
    where.id = branchId;
  }

  const branches = await prisma.branch.findMany({ where, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  if (branches.length === 0) throw fail('EXPORT_NO_BRANCHES', 404);
  return branches;
}

// --- The four record types, for one branch and one window ------------------

const COUNTER_INCLUDE = {
  items: true,
  placedByMembership: { include: { user: { select: { name: true } } } },
};

const SUPPLY_INCLUDE = {
  items: true,
  placedByMembership: { include: { user: { select: { name: true } } } },
  deliveryAgentMembership: { include: { user: { select: { name: true } } } },
};

/**
 * `dateFilter` is the `@db.Date` predicate (one day, or a month range) and
 * `instantWindow` the matching `[start, end)` of real time. Both describe the same
 * period; they differ only because the columns do.
 */
async function recordsFor(businessId, branch, { dateFilter, instantWindow }) {
  const [counterOrders, supplyOrders, expenses, attendance] = await Promise.all([
    prisma.counterOrder.findMany({
      where: { businessId, branchId: branch.id, tokenDate: dateFilter },
      include: COUNTER_INCLUDE,
      orderBy: [{ tokenDate: 'asc' }, { tokenNumber: 'asc' }],
    }),
    prisma.supplyOrder.findMany({
      where: {
        businessId,
        branchId: branch.id,
        status: { in: SPENDING_SUPPLY_STATUSES },
        placedAt: { gte: instantWindow.start, lt: instantWindow.end },
      },
      include: SUPPLY_INCLUDE,
      orderBy: { placedAt: 'asc' },
    }),
    prisma.expense.findMany({
      where: { businessId, branchId: branch.id, expenseDate: dateFilter },
      include: { category: true, recordedByMembership: { include: { user: { select: { name: true } } } } },
      orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.attendance.findMany({
      where: { businessId, branchId: branch.id, date: dateFilter },
      include: { staffMember: { select: { name: true, employeeCode: true, role: true } } },
      orderBy: [{ date: 'asc' }, { staffMember: { name: 'asc' } }],
    }),
  ]);

  return { counterOrders, supplyOrders, expenses, attendance };
}

/**
 * Evidence that one payment was recorded twice.
 *
 * Only custom categories are considered: the seeded eight are known not to be
 * raw material, so an electricity bill that happens to equal a flour order is a
 * coincidence, not a mistake. Matching on the exact amount, same branch, same
 * day, keeps this a statement about two rows rather than a guess about a name —
 * a name-based heuristic could not work across four languages anyway.
 *
 * Returned as a code and params, never a sentence, because this also travels in
 * the JSON response that the app renders itself.
 */
function overlapFlags(expenses, supplyOrders) {
  const flags = [];

  for (const expense of expenses) {
    // A seeded category has a `code`; one somebody typed does not.
    if (expense.category?.code) continue;

    const match = supplyOrders.find((order) => toDecimal(order.totalAmount).equals(toDecimal(expense.amount)));
    if (!match) continue;

    flags.push({
      code: 'EXPENSE_MATCHES_SUPPLY_ORDER',
      params: {
        category: expense.category?.name ?? '',
        amount: String(expense.amount),
        orderNumber: match.orderNumber,
        date: dateKeyOf(expense.expenseDate),
      },
      expenseId: expense.id,
      supplyOrderId: match.id,
    });
  }

  return flags;
}

function totalsOf({ counterOrders, supplyOrders, expenses, attendance }) {
  // A VOID token is a mistake that was corrected, so it is listed but never
  // counted — the same reason getSalesSummary filters on COMPLETED.
  const counted = counterOrders.filter((order) => order.status !== 'VOID');

  const byStatus = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0 };
  for (const record of attendance) {
    if (record.status in byStatus) byStatus[record.status] += 1;
  }

  return {
    counterSales: sumOf(counted),
    counterOrderCount: counted.length,
    counterVoidCount: counterOrders.length - counted.length,
    counterOpenCount: counted.filter((order) => order.status === 'OPEN').length,
    supplySpend: sumOf(supplyOrders),
    supplyOrderCount: supplyOrders.length,
    expenseTotal: sumOf(expenses, 'amount'),
    expenseCount: expenses.length,
    attendance: byStatus,
    staffMarked: attendance.length,
  };
}

/** Business-wide sums over the per-branch sections. */
function combine(sections) {
  const total = {
    counterSales: zero(),
    counterOrderCount: 0,
    counterVoidCount: 0,
    counterOpenCount: 0,
    supplySpend: zero(),
    supplyOrderCount: 0,
    expenseTotal: zero(),
    expenseCount: 0,
    attendance: { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0 },
    staffMarked: 0,
  };

  for (const { totals } of sections) {
    total.counterSales = total.counterSales.plus(totals.counterSales);
    total.counterOrderCount += totals.counterOrderCount;
    total.counterVoidCount += totals.counterVoidCount;
    total.counterOpenCount += totals.counterOpenCount;
    total.supplySpend = total.supplySpend.plus(totals.supplySpend);
    total.supplyOrderCount += totals.supplyOrderCount;
    total.expenseTotal = total.expenseTotal.plus(totals.expenseTotal);
    total.expenseCount += totals.expenseCount;
    total.staffMarked += totals.staffMarked;
    for (const status of Object.keys(total.attendance)) {
      total.attendance[status] += totals.attendance[status];
    }
  }

  return total;
}

async function currencyOf(business, branch) {
  return branch.currency ?? business.defaultCurrency;
}

// --- Day end ---------------------------------------------------------------

/**
 * Everything entered at a branch on one of its own calendar days.
 *
 * `dayClose` is carried rather than enforced: an export does not require the day
 * to be closed, because the person running it in the evening may be doing so
 * precisely to check before closing. It is reported so the document can say
 * whether the figures are final.
 */
async function getDayEnd(businessId, { date, branchId = null, accessibleBranchIds = null } = {}) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw fail('BUSINESS_NOT_FOUND', 404);

  const branches = await branchesFor(businessId, { branchId, accessibleBranchIds });

  const sections = [];
  for (const branch of branches) {
    const zone = safeZone(branch.timezone);
    const dateKey = date || todayKeyInZone(zone);

    const records = await recordsFor(businessId, branch, {
      dateFilter: dateOnly(dateKey),
      instantWindow: localDayRange(dateKey, zone),
    });

    const dayClose = await prisma.dayClose.findFirst({
      where: { branchId: branch.id, date: dateOnly(dateKey) },
      include: { closedByMembership: { include: { user: { select: { name: true } } } } },
    });

    sections.push({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        kind: branch.kind,
        timezone: branch.timezone,
        currency: await currencyOf(business, branch),
      },
      date: dateKey,
      ...records,
      totals: totalsOf(records),
      overlaps: overlapFlags(records.expenses, records.supplyOrders),
      dayClose: dayClose
        ? { closedAt: dayClose.closedAt, closedBy: dayClose.closedByMembership?.user?.name ?? null }
        : null,
    });
  }

  return {
    kind: 'DAY',
    // Null when each branch was asked about its own local date, which is the
    // honest answer: there was no single date.
    date: date ?? null,
    business: { id: business.id, name: business.name, currency: business.defaultCurrency },
    generatedAt: new Date(),
    branches: sections,
    totals: combine(sections),
    overlaps: sections.flatMap((section) => section.overlaps),
  };
}

// --- Month end -------------------------------------------------------------

/**
 * The same four record types over a whole month, plus the payslips for it.
 *
 * Payroll is in the month export and not the day one because a payslip is a
 * monthly document — there is no such thing as one day's payslip, and putting a
 * pro-rated fragment in a day-end sheet would invent a figure nobody can check.
 */
async function getMonthEnd(businessId, { month, branchId = null, accessibleBranchIds = null } = {}) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw fail('BUSINESS_NOT_FOUND', 404);

  const branches = await branchesFor(businessId, { branchId, accessibleBranchIds });
  const monthKey = month || thisMonthKeyInZone(safeZone(branches[0].timezone));
  if (!isRealMonthKey(monthKey)) throw fail('EXPORT_MONTH_INVALID', 400);

  const [year, monthNumber] = monthKey.split('-').map(Number);
  const nextMonthKey = monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
  const dateFilter = { gte: dateOnly(`${monthKey}-01`), lt: dateOnly(`${nextMonthKey}-01`) };

  const sections = [];
  for (const branch of branches) {
    const zone = safeZone(branch.timezone);

    const records = await recordsFor(businessId, branch, {
      dateFilter,
      instantWindow: localMonthRange(monthKey, zone),
    });

    const salarySlips = await prisma.salarySlip.findMany({
      where: { businessId, branchId: branch.id, monthYear: monthKey },
      include: { staffMember: { select: { name: true, employeeCode: true, role: true } } },
      orderBy: { staffMember: { name: 'asc' } },
    });

    const totals = totalsOf(records);
    totals.payroll = sumOf(salarySlips, 'netPay');
    totals.payslipCount = salarySlips.length;
    totals.payslipDraftCount = salarySlips.filter((slip) => slip.status === 'DRAFT').length;

    sections.push({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        kind: branch.kind,
        timezone: branch.timezone,
        currency: await currencyOf(business, branch),
      },
      month: monthKey,
      ...records,
      salarySlips,
      totals,
      overlaps: overlapFlags(records.expenses, records.supplyOrders),
    });
  }

  const totals = combine(sections);
  totals.payroll = sections.reduce((sum, section) => sum.plus(section.totals.payroll), zero());
  totals.payslipCount = sections.reduce((sum, section) => sum + section.totals.payslipCount, 0);
  totals.payslipDraftCount = sections.reduce((sum, section) => sum + section.totals.payslipDraftCount, 0);

  return {
    kind: 'MONTH',
    month: monthKey,
    business: { id: business.id, name: business.name, currency: business.defaultCurrency },
    generatedAt: new Date(),
    branches: sections,
    totals,
    overlaps: sections.flatMap((section) => section.overlaps),
  };
}

module.exports = {
  SPENDING_SUPPLY_STATUSES,
  getDayEnd,
  getMonthEnd,
};
