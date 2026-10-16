const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const { dateKeyOf, dateOnly, localDayRange, safeZone, todayKeyInZone } = require('../utils/datetime');

/**
 * Today at a glance — requirement 33, the figures at the top of Home.
 *
 * Sales, bills and spending for *today*, where today is each branch's own day:
 * a business with a branch in Kolkata and one in Dubai adds up two different
 * stretches of real time, each the one its own staff call today. Not the
 * month-by-month grid (`analytics.service.js`): this is what the counter and
 * the owner glance at between customers, so it is three numbers and five bills.
 *
 * Sales are the day's completed transactions — counter sales and imported ones
 * alike, the same fact table Reports reads. Expenses include a warehouse's, which
 * has bills too; sales come only from branches that trade.
 *
 * Two things are second decisions made by the controller from the caller's own
 * capabilities: the day's spending only for somebody who may read expenses, and
 * the latest bills only for somebody who bills.
 */

/** How many of the day's latest bills Home lists. */
const RECENT_BILLS = 5;

function decimal(value) {
  return new Prisma.Decimal(value ?? 0);
}

async function getToday(businessId, { accessibleBranchIds, branchId, includeExpenses, includeBills }) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { defaultCurrency: true },
  });
  if (!business) throw fail('BUSINESS_NOT_FOUND', 404);

  const reach = accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } };
  if (branchId && accessibleBranchIds !== null && !accessibleBranchIds.includes(branchId)) {
    throw fail('BRANCH_ACCESS_DENIED', 403);
  }
  const branches = await prisma.branch.findMany({
    where: { businessId, status: { not: 'CLOSED' }, ...reach, ...(branchId ? { id: branchId } : {}) },
    select: { id: true, name: true, code: true, kind: true, timezone: true, currency: true },
    orderBy: { name: 'asc' },
  });

  const dayOf = new Map(branches.map((branch) => [branch.id, todayKeyInZone(safeZone(branch.timezone))]));
  const trading = branches.filter((branch) => branch.kind === 'BRANCH');

  // One query per (time zone, day): a zone's branches share the same window.
  const windows = new Map();
  for (const branch of trading) {
    const zone = safeZone(branch.timezone);
    const key = `${zone}|${dayOf.get(branch.id)}`;
    if (!windows.has(key)) windows.set(key, { zone, day: dayOf.get(branch.id), ids: [] });
    windows.get(key).ids.push(branch.id);
  }
  const salesRows = (
    await Promise.all(
      [...windows.values()].map(({ zone, day, ids }) => {
        const { start, end } = localDayRange(day, zone);
        return prisma.transaction.groupBy({
          by: ['branchId'],
          where: { businessId, branchId: { in: ids }, status: 'COMPLETED', occurredAt: { gte: start, lt: end } },
          _sum: { totalAmount: true },
          _count: { _all: true },
        });
      })
    )
  ).flat();
  const salesBy = new Map(salesRows.map((row) => [row.branchId, row]));

  const spentRows =
    includeExpenses && branches.length > 0
      ? await prisma.expense.groupBy({
          by: ['branchId'],
          where: {
            businessId,
            OR: branches.map((branch) => ({ branchId: branch.id, expenseDate: dateOnly(dayOf.get(branch.id)) })),
          },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : [];
  const spentBy = new Map(spentRows.map((row) => [row.branchId, row]));

  const recent =
    includeBills && trading.length > 0
      ? await prisma.counterOrder.findMany({
          where: {
            businessId,
            status: { not: 'OPEN' },
            OR: trading.map((branch) => ({ branchId: branch.id, tokenDate: dateOnly(dayOf.get(branch.id)) })),
          },
          orderBy: [{ closedAt: 'desc' }, { openedAt: 'desc' }],
          take: RECENT_BILLS,
          include: {
            branch: { select: { name: true, code: true } },
            items: { select: { quantity: true } },
          },
        })
      : null;

  const currencies = new Set(branches.map((branch) => branch.currency || business.defaultCurrency));
  const rows = branches.map((branch) => {
    const sold = salesBy.get(branch.id);
    const spent = spentBy.get(branch.id);
    return {
      branchId: branch.id,
      name: branch.name,
      code: branch.code,
      kind: branch.kind,
      dayKey: dayOf.get(branch.id),
      currency: branch.currency || business.defaultCurrency,
      sales: branch.kind === 'BRANCH' ? decimal(sold?._sum.totalAmount) : null,
      saleCount: branch.kind === 'BRANCH' ? (sold?._count._all ?? 0) : null,
      expenses: includeExpenses ? decimal(spent?._sum.amount) : null,
      expenseCount: includeExpenses ? (spent?._count._all ?? 0) : null,
    };
  });

  const total = (pick) => rows.reduce((sum, row) => sum.plus(pick(row) ?? 0), decimal(0));

  return {
    currency: currencies.size === 1 ? [...currencies][0] : business.defaultCurrency,
    // Adding rupees to dirhams is not a total; the app says so instead.
    mixedCurrency: currencies.size > 1,
    branches: rows,
    totals: {
      sales: total((row) => row.sales),
      saleCount: rows.reduce((sum, row) => sum + (row.saleCount ?? 0), 0),
      expenses: includeExpenses ? total((row) => row.expenses) : null,
      expenseCount: includeExpenses ? rows.reduce((sum, row) => sum + (row.expenseCount ?? 0), 0) : null,
    },
    recentBills: recent
      ? recent.map((order) => ({
          id: order.id,
          branchId: order.branchId,
          branchName: order.branch.name,
          branchCode: order.branch.code,
          tokenNumber: order.tokenNumber,
          tokenDate: dateKeyOf(order.tokenDate),
          status: order.status,
          paymentMethod: order.paymentMethod,
          totalAmount: order.totalAmount,
          currency: order.currency,
          itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity), 0),
          at: order.closedAt ?? order.openedAt,
        }))
      : null,
  };
}

module.exports = { getToday, RECENT_BILLS };
