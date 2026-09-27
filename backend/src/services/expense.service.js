const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const { dateOnly, dateKeyOf, todayKeyInZone, safeZone, localDayRange } = require('../utils/datetime');

/**
 * Branch expenses — requirement 10.
 *
 * "Gas bill, electricity bill, petty expenses and everything else. Also daily
 * cost: how much did I spend today? And how much did I sell today? Category-wise
 * too. The person at the back office will call the branches that haven't logged
 * their daily expenses."
 *
 * The counterpart to counter billing: that service records what a branch took
 * in, this records what it paid out, and the two meet in `getDaySummary`.
 *
 * ## Three rules this follows
 *
 * 1. **The branch's own day, never the server's.** `expenseDate` is a
 *    `@db.Date` in the branch's timezone, matching `CounterOrder.tokenDate`, so
 *    today's spend and today's sales are drawn from the same day.
 * 2. **Categories are codes, not prose.** The seeded set carries a `code` the
 *    device translates; only a category somebody typed is shown verbatim.
 * 3. **"Who hasn't logged today" is a query, not a job.** Computed when someone
 *    opens the screen, so it is exact — a snapshot taken at 20:00 is wrong by
 *    20:05, and the requirement says a person makes the call anyway.
 */

/**
 * What every business starts with.
 *
 * **Kept identical to the backfill in
 * `prisma/migrations/20260925210000_branch_expenses/migration.sql`**, which
 * seeds the businesses that already existed when this shipped. The two are
 * separate by necessity — one runs in SQL against every row, the other inside
 * the transaction that creates a business — so a category added to one belongs
 * in a new migration rather than only here, or businesses will differ by age.
 *
 * `name` is the English fallback, the same role the English in
 * `errors/catalog.js` plays: curl and the logs see it, a person does not.
 *
 * There is deliberately no raw-material category — see the note on
 * `ExpenseCategory` in the schema, and §5 of REQUIREMENTS.md.
 */
const SEEDED_CATEGORIES = [
  { code: 'MILK', name: 'Milk', sortOrder: 10 },
  { code: 'GAS', name: 'Gas', sortOrder: 20 },
  { code: 'ELECTRICITY', name: 'Electricity', sortOrder: 30 },
  { code: 'RENT', name: 'Rent', sortOrder: 40 },
  { code: 'REPAIRS', name: 'Repairs', sortOrder: 50 },
  { code: 'TRANSPORT', name: 'Transport', sortOrder: 60 },
  { code: 'PETTY', name: 'Petty cash', sortOrder: 70 },
  { code: 'OTHER', name: 'Other', sortOrder: 80 },
];

/** A category somebody typed sorts after every seeded one. */
const CUSTOM_SORT_ORDER = 100;

const CATEGORY_NAME_MAX = 60;

function toDecimal(value) {
  return new Prisma.Decimal(value);
}

function zero() {
  return new Prisma.Decimal(0);
}

/**
 * Seed a new business's categories.
 *
 * Called from `createBusinessForUser`, the single seam both signup and
 * `POST /businesses` go through — so a business created either way starts with
 * the same list, and neither path can drift from the other.
 */
function seedCategories(businessId, client = prisma) {
  return client.expenseCategory.createMany({
    data: SEEDED_CATEGORIES.map((category) => ({ ...category, businessId })),
    skipDuplicates: true,
  });
}

/**
 * The branch an expense belongs to.
 *
 * Unlike `counterOrder.branchOf` and `supplyOrder.branchOf`, a WAREHOUSE is
 * **allowed** here. It has no till and orders no raw material from itself, but
 * it does pay an electricity bill — a location with costs and no way to record
 * them is a hole in the figures, not a rule being enforced.
 */
async function branchOf(businessId, branchId) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) throw fail('BRANCH_NOT_FOUND_IN_BUSINESS', 404);
  return branch;
}

function branchTodayKey(branch) {
  return todayKeyInZone(safeZone(branch.timezone));
}

async function currencyOf(businessId, branch) {
  if (branch.currency) return branch.currency;
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  return business.defaultCurrency;
}

// --- Categories ------------------------------------------------------------

function listCategories(businessId, { includeInactive = false } = {}) {
  return prisma.expenseCategory.findMany({
    where: { businessId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

async function getCategory(businessId, categoryId) {
  const category = await prisma.expenseCategory.findFirst({ where: { id: categoryId, businessId } });
  if (!category) throw fail('EXPENSE_CATEGORY_NOT_FOUND', 404);
  return category;
}

/**
 * Add a category of the branch's own.
 *
 * The seeded eight cover what requirement 10 names, but not "Vegetables" or
 * "Staff tea" — and without a way to add one, everything specific lands in
 * Other with a note, which destroys the category breakdown the requirement
 * explicitly asks for.
 */
async function createCategory(businessId, { name }) {
  const trimmed = String(name).trim();

  // Checked rather than left to the unique index, so the refusal says which
  // rule was broken. The index is still the thing that makes it true.
  const clash = await prisma.expenseCategory.findFirst({ where: { businessId, name: trimmed } });
  if (clash) throw fail('EXPENSE_CATEGORY_DUPLICATE', 409, { name: trimmed });

  return prisma.expenseCategory.create({
    data: { businessId, code: null, name: trimmed, sortOrder: CUSTOM_SORT_ORDER },
  });
}

/**
 * Rename or withdraw a category.
 *
 * A seeded category cannot be renamed, because its name is not what anybody
 * sees — the device renders `t('expenseCategory.<code>')` and would ignore the
 * change, leaving an edit that appears to work and does nothing. Withdrawing
 * one is allowed: a business with no gas bill should be able to take Gas off
 * the list.
 */
async function updateCategory(businessId, categoryId, { name, isActive }) {
  const category = await getCategory(businessId, categoryId);
  const data = {};

  if (name !== undefined) {
    if (category.code) throw fail('EXPENSE_CATEGORY_IS_STANDARD', 400);
    const trimmed = String(name).trim();
    const clash = await prisma.expenseCategory.findFirst({
      where: { businessId, name: trimmed, id: { not: categoryId } },
    });
    if (clash) throw fail('EXPENSE_CATEGORY_DUPLICATE', 409, { name: trimmed });
    data.name = trimmed;
  }

  if (isActive !== undefined) data.isActive = isActive;

  return prisma.expenseCategory.update({ where: { id: categoryId }, data });
}

// --- Expenses --------------------------------------------------------------

const EXPENSE_INCLUDE = {
  category: true,
  recordedByMembership: { include: { user: { select: { name: true } } } },
};

async function assertCategoryUsable(businessId, categoryId) {
  const category = await getCategory(businessId, categoryId);
  if (!category.isActive) throw fail('EXPENSE_CATEGORY_INACTIVE', 400, { name: category.name });
  return category;
}

/**
 * The date an expense is filed against.
 *
 * Defaults to the branch's today. A date in the branch's future is refused:
 * "what did I spend today" cannot be answered by a row from next week, and the
 * mistake it usually represents is a mistyped year.
 */
function resolveExpenseDate(branch, date) {
  const todayKey = branchTodayKey(branch);
  const key = date || todayKey;
  if (key > todayKey) throw fail('EXPENSE_DATE_IN_FUTURE', 400);
  return dateOnly(key);
}

async function logExpense(businessId, { branchId, categoryId, amount, date, note, paymentMethod, membershipId }) {
  const branch = await branchOf(businessId, branchId);
  await assertCategoryUsable(businessId, categoryId);

  return prisma.expense.create({
    data: {
      businessId,
      branchId,
      categoryId,
      amount: toDecimal(amount),
      currency: await currencyOf(businessId, branch),
      expenseDate: resolveExpenseDate(branch, date),
      note: note ?? null,
      paymentMethod: paymentMethod ?? 'UNSPECIFIED',
      // Who logged it comes from the session, never the body.
      recordedByMembershipId: membershipId ?? null,
    },
    include: EXPENSE_INCLUDE,
  });
}

async function getExpense(businessId, expenseId) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, businessId },
    include: EXPENSE_INCLUDE,
  });
  if (!expense) throw fail('EXPENSE_NOT_FOUND', 404);
  return expense;
}

/**
 * Correct a logged expense.
 *
 * Unlike a counter order there is no day-close floor on this: an expense is not
 * a number a customer was shown, and a gas bill that arrives a week late is the
 * normal case rather than the exception.
 */
async function updateExpense(businessId, expenseId, { categoryId, amount, date, note, paymentMethod }) {
  const expense = await getExpense(businessId, expenseId);
  const data = {};

  if (categoryId !== undefined) {
    await assertCategoryUsable(businessId, categoryId);
    data.categoryId = categoryId;
  }
  if (amount !== undefined) data.amount = toDecimal(amount);
  if (date !== undefined) {
    const branch = await branchOf(businessId, expense.branchId);
    data.expenseDate = resolveExpenseDate(branch, date);
  }
  if (note !== undefined) data.note = note;
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod;

  return prisma.expense.update({ where: { id: expenseId }, data, include: EXPENSE_INCLUDE });
}

async function deleteExpense(businessId, expenseId) {
  await getExpense(businessId, expenseId);
  await prisma.expense.delete({ where: { id: expenseId } });
}

/**
 * One branch's expenses, either for a single day or for a whole month.
 *
 * Both windows are ranges over `expenseDate`, which is already the branch's own
 * calendar day — so neither needs a timezone conversion. Only sales do.
 */
async function listExpenses(businessId, branchId, { date, month, year } = {}) {
  const branch = await branchOf(businessId, branchId);
  const where = { businessId, branchId };

  if (date) {
    where.expenseDate = dateOnly(date);
  } else if (month && year) {
    where.expenseDate = { gte: dateOnly(monthStartKey(month, year)), lt: dateOnly(nextMonthStartKey(month, year)) };
  } else {
    where.expenseDate = dateOnly(branchTodayKey(branch));
  }

  return prisma.expense.findMany({
    where,
    include: EXPENSE_INCLUDE,
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
  });
}

function monthStartKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function nextMonthStartKey(month, year) {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Group a set of expenses into `{ categoryId, code, name, amount, count }`. */
function breakdownOf(expenses) {
  const byCategory = new Map();

  for (const expense of expenses) {
    const existing = byCategory.get(expense.categoryId);
    if (existing) {
      existing.amount = existing.amount.plus(toDecimal(expense.amount));
      existing.count += 1;
    } else {
      byCategory.set(expense.categoryId, {
        categoryId: expense.categoryId,
        // The code travels so the device can translate; the name is the
        // fallback and the only thing a custom category has.
        code: expense.category?.code ?? null,
        name: expense.category?.name ?? null,
        amount: toDecimal(expense.amount),
        count: 1,
      });
    }
  }

  return [...byCategory.values()].sort((a, b) => b.amount.comparedTo(a.amount));
}

function sumOf(expenses) {
  return expenses.reduce((total, expense) => total.plus(toDecimal(expense.amount)), zero());
}

/**
 * What a branch sold on one of its own calendar days.
 *
 * Reads `Transaction`, not `CounterOrder`, because a counter order is projected
 * into that table and an imported POS row is only ever in it — asking the
 * counter alone would answer "what did I ring up" rather than "what did I
 * sell". `localDayRange` turns the branch's calendar day into the window of
 * real time it occupied, which is what makes this comparable with the expenses
 * beside it.
 */
async function salesOn(businessId, branch, dateKey) {
  const { start, end } = localDayRange(dateKey, safeZone(branch.timezone));

  const result = await prisma.transaction.aggregate({
    where: {
      businessId,
      branchId: branch.id,
      status: 'COMPLETED',
      occurredAt: { gte: start, lt: end },
    },
    _sum: { totalAmount: true },
    _count: true,
  });

  return { total: result._sum.totalAmount ?? zero(), count: result._count };
}

/**
 * "How much did I spend today? And how much did I sell today?" — one screen,
 * because the requirement asks them as one question.
 */
async function getDaySummary(businessId, branchId, { date } = {}) {
  const branch = await branchOf(businessId, branchId);
  const dateKey = date || branchTodayKey(branch);

  const expenses = await prisma.expense.findMany({
    where: { businessId, branchId, expenseDate: dateOnly(dateKey) },
    include: EXPENSE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  const spent = sumOf(expenses);
  const sales = await salesOn(businessId, branch, dateKey);

  return {
    branchId,
    date: dateOnly(dateKey),
    currency: await currencyOf(businessId, branch),
    expenseCount: expenses.length,
    totalSpent: spent,
    totalSold: sales.total,
    saleCount: sales.count,
    // Positive means the branch took in more than it paid out. Named
    // `difference` rather than `profit`: this is one day's cash movement, not
    // net profit — that is requirement 13, and it subtracts payroll and supply
    // spend this figure knows nothing about.
    difference: toDecimal(sales.total).minus(spent),
    breakdown: breakdownOf(expenses),
    expenses,
  };
}

/**
 * A month's spend for one branch: the total, the category breakdown, and a
 * figure per day so the screen can show which days are missing.
 */
async function getMonthSummary(businessId, branchId, { month, year }) {
  const branch = await branchOf(businessId, branchId);

  const expenses = await prisma.expense.findMany({
    where: {
      businessId,
      branchId,
      expenseDate: { gte: dateOnly(monthStartKey(month, year)), lt: dateOnly(nextMonthStartKey(month, year)) },
    },
    include: EXPENSE_INCLUDE,
    orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
  });

  const byDay = new Map();
  for (const expense of expenses) {
    const key = dateKeyOf(expense.expenseDate);
    byDay.set(key, (byDay.get(key) ?? zero()).plus(toDecimal(expense.amount)));
  }

  return {
    branchId,
    month,
    year,
    currency: await currencyOf(businessId, branch),
    expenseCount: expenses.length,
    totalSpent: sumOf(expenses),
    breakdown: breakdownOf(expenses),
    days: [...byDay.entries()].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Which branches have logged nothing — requirement 10's last line, and the
 * reason this is a query rather than a scheduled job.
 *
 * **Every branch is asked about its own day.** A business with branches in two
 * timezones has no single "today", and taking the server's would tell the back
 * office to call a branch for which the day has not started. With no `date`
 * given, each branch is checked against its own local date; with one, every
 * branch is checked against that date, which is what makes "who missed
 * Tuesday?" answerable.
 *
 * Two queries regardless of how many branches there are: the branch list, then
 * one grouped count over the (branch, date) pairs it produced.
 */
async function listExpenseCompliance(businessId, { date } = {}) {
  const branches = await prisma.branch.findMany({
    where: { businessId, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });

  const wanted = branches.map((branch) => ({
    branch,
    dateKey: date || branchTodayKey(branch),
  }));

  const grouped = await prisma.expense.groupBy({
    by: ['branchId', 'expenseDate'],
    where: {
      businessId,
      branchId: { in: branches.map((branch) => branch.id) },
      expenseDate: { in: [...new Set(wanted.map((entry) => entry.dateKey))].map(dateOnly) },
    },
    _sum: { amount: true },
    _count: true,
  });

  const logged = new Map(
    grouped.map((row) => [`${row.branchId}|${dateKeyOf(row.expenseDate)}`, row])
  );

  const rows = wanted.map(({ branch, dateKey }) => {
    const row = logged.get(`${branch.id}|${dateKey}`);
    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code,
      branchKind: branch.kind,
      timezone: branch.timezone,
      date: dateKey,
      hasLogged: !!row,
      expenseCount: row?._count ?? 0,
      totalSpent: row?._sum?.amount ?? zero(),
    };
  });

  return {
    date: date ?? null,
    branchCount: rows.length,
    missingCount: rows.filter((row) => !row.hasLogged).length,
    branches: rows,
  };
}

module.exports = {
  SEEDED_CATEGORIES,
  seedCategories,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  logExpense,
  getExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  getDaySummary,
  getMonthSummary,
  listExpenseCompliance,
};
