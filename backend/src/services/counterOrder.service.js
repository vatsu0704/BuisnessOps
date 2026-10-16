const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const { dateKeyOf, dateOnly, offsetMinutesAt, todayKeyInZone, safeZone } = require('../utils/datetime');
const { writeTransaction, counterExternalId } = require('./salesProjection.service');
const { withEffectivePricing } = require('./product.service');

/**
 * Counter billing — requirement 1.
 *
 * "As orders come in the cashier adds them, issues a token, and the money keeps
 * counting. Once an order is taken they can also edit it."
 *
 * The app no longer uses the open-add-close calls below: requirement 29 moved
 * the order onto the phone, where it is rung up with no network and recorded
 * here in one piece once it is paid — see `counterSale.service.js`. They stay,
 * unchanged, for app builds from before that, and the projection, the day close
 * and the summary are shared by both paths.
 *
 * ## The two rules everything here follows
 *
 * 1. **The order is not the sale.** Every mutation recomputes the total from
 *    the items and re-projects into Transaction/LineItem inside one
 *    `prisma.$transaction`. Reporting therefore keeps reading one fact table,
 *    and because the projection is idempotent, editing is free — it just runs
 *    again.
 * 2. **A closed day is immutable.** Editable-after-placing needs a floor, or an
 *    edit after the day-end export silently restates a number someone was
 *    already shown.
 */

const ORDER_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
};

/** Money as Decimal throughout. Floats have no business in a till. */
function toDecimal(value) {
  return new Prisma.Decimal(value);
}

/**
 * The branch a token belongs to, and a check that it is one.
 *
 * A WAREHOUSE location has no counter and no customers — it is a place the
 * business staffs, not one it sells from. Guarded here rather than only in the
 * branch picker, because a token issued against a warehouse would put a sale
 * into the sales figures for somewhere that never made one.
 */
async function branchOf(businessId, branchId) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) throw fail('BRANCH_NOT_FOUND_IN_BUSINESS', 404);
  if (branch.kind === 'WAREHOUSE') throw fail('BRANCH_IS_WAREHOUSE', 400);
  return branch;
}

/**
 * The branch's own local date.
 *
 * Never UTC: a branch in Asia/Kolkata keyed on UTC restarts its token numbering
 * at 05:30 local, in the middle of breakfast.
 */
function branchToday(branch) {
  return dateOnly(todayKeyInZone(safeZone(branch.timezone)));
}

/**
 * Allocate the next token for a branch on a date.
 *
 * The project's first deliberate `$queryRaw`, and the reason is worth stating:
 * Prisma cannot express `ON CONFLICT DO UPDATE SET x = x + 1`, and every
 * alternative is worse here. A `MAX(tokenNumber) + 1` read-then-write races two
 * cashiers on the same counter; adding a retry loop makes it degrade exactly
 * when the counter is busiest, and the failure mode is a 500 while a customer
 * is standing there. A Postgres sequence is the wrong shape entirely —
 * sequences are not per-branch-per-day, would need runtime DDL, and never
 * reset.
 *
 * One statement, atomic under READ COMMITTED, no read-then-write window, and it
 * handles the first order of the day without a separate insert.
 */
async function allocateToken(branchId, tokenDate, client) {
  const rows = await client.$queryRaw`
    INSERT INTO branch_token_counters ("branchId", "tokenDate", "lastNumber")
    VALUES (${branchId}::uuid, ${tokenDate}::date, 1)
    ON CONFLICT ("branchId", "tokenDate")
    DO UPDATE SET "lastNumber" = branch_token_counters."lastNumber" + 1
    RETURNING "lastNumber"`;
  return rows[0].lastNumber;
}

/** Has this branch's day been closed? Closed days refuse every mutation. */
async function assertDayOpen(branchId, date, client = prisma) {
  const closed = await client.dayClose.findUnique({
    where: { branchId_date: { branchId, date } },
  });
  if (closed) throw fail('COUNTER_ORDER_DAY_CLOSED', 409);
}

function sumItems(items) {
  return items.reduce((total, item) => total.plus(toDecimal(item.lineTotal)), new Prisma.Decimal(0));
}

/**
 * Recompute the total and mirror the order into the sales fact table.
 *
 * Always runs inside the caller's transaction, so an order and the sale it
 * represents can never disagree — including the VOID case, where the
 * transaction is marked VOIDED rather than deleted and the existing
 * `status: 'COMPLETED'` filter in getSalesSummary excludes it with no new code.
 */
async function reproject(order, client) {
  const items = await client.counterOrderItem.findMany({
    where: { counterOrderId: order.id },
    orderBy: { createdAt: 'asc' },
  });
  const totalAmount = sumItems(items);

  const { transaction } = await writeTransaction(
    {
      branchId: order.branchId,
      externalId: counterExternalId(order.id),
      header: {
        businessId: order.businessId,
        occurredAt: order.openedAt,
        totalAmount,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
        status: order.status === 'VOID' ? 'VOIDED' : 'COMPLETED',
        source: 'COUNTER',
      },
      items: items.map((item) => ({
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
    },
    client
  );

  return client.counterOrder.update({
    where: { id: order.id },
    data: { totalAmount, transactionId: transaction.id },
    include: ORDER_INCLUDE,
  });
}

/** Load an order and refuse to touch one whose day has been closed. */
async function loadEditable(businessId, counterOrderId, client = prisma) {
  const order = await client.counterOrder.findFirst({
    where: { id: counterOrderId, businessId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw fail('COUNTER_ORDER_NOT_FOUND', 404);
  await assertDayOpen(order.branchId, order.tokenDate, client);
  return order;
}

/**
 * Open an order and issue its token.
 *
 * The token is issued up front, not on close: the customer needs a number the
 * moment they order, which is the entire point of a token.
 */
async function openOrder(businessId, { branchId, membershipId, paymentMethod }) {
  const branch = await branchOf(businessId, branchId);
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const tokenDate = branchToday(branch);

  await assertDayOpen(branchId, tokenDate);

  return prisma.$transaction(async (tx) => {
    const tokenNumber = await allocateToken(branchId, tokenDate, tx);
    const order = await tx.counterOrder.create({
      data: {
        businessId,
        branchId,
        tokenNumber,
        tokenDate,
        totalAmount: new Prisma.Decimal(0),
        currency: branch.currency || business.defaultCurrency,
        paymentMethod: paymentMethod ?? 'UNSPECIFIED',
        placedByMembershipId: membershipId ?? null,
      },
      include: ORDER_INCLUDE,
    });
    // An empty order still projects, so a token that was issued and abandoned
    // is visible as a zero rather than as nothing at all.
    return reproject(order, tx);
  });
}

/**
 * Add a line.
 *
 * The price comes from the catalog, resolved for this branch, rather than from
 * the client — a price the caller can name is a price the caller can invent.
 * An explicit `unitPrice` is accepted only for a one-off item with no product
 * behind it, which is what `productId: null` means.
 */
async function addItem(businessId, counterOrderId, { productId, quantity, unitPrice, name }) {
  return prisma.$transaction(async (tx) => {
    const order = await loadEditable(businessId, counterOrderId, tx);
    if (order.status === 'VOID') throw fail('COUNTER_ORDER_VOIDED', 409);

    let resolvedName = name;
    let resolvedPrice = unitPrice;

    if (productId) {
      const product = await tx.product.findFirst({
        where: { id: productId, businessId },
        include: { branchDetails: { where: { branchId: order.branchId } } },
      });
      if (!product) throw fail('PRODUCT_NOT_FOUND', 404);
      // A branch cannot ring up another branch's private product.
      if (product.branchId && product.branchId !== order.branchId) {
        throw fail('PRODUCT_NOT_SOLD_AT_BRANCH', 400);
      }

      const { branchDetails, ...rest } = product;
      const priced = withEffectivePricing(rest, branchDetails[0]);
      if (priced.effectiveSellPrice === null) throw fail('PRODUCT_HAS_NO_PRICE', 400);

      resolvedName = product.name;
      resolvedPrice = priced.effectiveSellPrice;
    } else if (resolvedPrice === undefined || resolvedPrice === null || !resolvedName) {
      throw fail('COUNTER_ITEM_NEEDS_PRODUCT_OR_PRICE', 400);
    }

    const qty = toDecimal(quantity);
    const price = toDecimal(resolvedPrice);

    await tx.counterOrderItem.create({
      data: {
        counterOrderId: order.id,
        productId: productId ?? null,
        productNameSnapshot: resolvedName,
        quantity: qty,
        unitPrice: price,
        lineTotal: qty.times(price),
      },
    });

    return reproject(order, tx);
  });
}

/** Change a line's quantity. Zero is a removal, expressed the way a till does. */
async function updateItem(businessId, counterOrderId, itemId, { quantity }) {
  return prisma.$transaction(async (tx) => {
    const order = await loadEditable(businessId, counterOrderId, tx);
    if (order.status === 'VOID') throw fail('COUNTER_ORDER_VOIDED', 409);

    const item = await tx.counterOrderItem.findFirst({ where: { id: itemId, counterOrderId: order.id } });
    if (!item) throw fail('COUNTER_ITEM_NOT_FOUND', 404);

    const qty = toDecimal(quantity);
    if (qty.isZero()) {
      await tx.counterOrderItem.delete({ where: { id: item.id } });
    } else {
      await tx.counterOrderItem.update({
        where: { id: item.id },
        data: { quantity: qty, lineTotal: qty.times(toDecimal(item.unitPrice)) },
      });
    }

    return reproject(order, tx);
  });
}

async function removeItem(businessId, counterOrderId, itemId) {
  return updateItem(businessId, counterOrderId, itemId, { quantity: 0 });
}

/**
 * Hand the order over.
 *
 * Closing is not finalising: requirement 1 asks for orders to stay editable
 * after they are taken, so a CLOSED order can still be reopened or corrected.
 * The immutability floor is the day close, not this.
 */
async function closeOrder(businessId, counterOrderId, { paymentMethod } = {}) {
  return prisma.$transaction(async (tx) => {
    const order = await loadEditable(businessId, counterOrderId, tx);
    if (order.status === 'VOID') throw fail('COUNTER_ORDER_VOIDED', 409);

    const updated = await tx.counterOrder.update({
      where: { id: order.id },
      data: {
        status: 'CLOSED',
        closedAt: order.closedAt ?? new Date(),
        ...(paymentMethod ? { paymentMethod } : {}),
      },
      include: ORDER_INCLUDE,
    });
    return reproject(updated, tx);
  });
}

/** Reopen a closed order to correct it. */
async function reopenOrder(businessId, counterOrderId) {
  return prisma.$transaction(async (tx) => {
    const order = await loadEditable(businessId, counterOrderId, tx);
    if (order.status === 'VOID') throw fail('COUNTER_ORDER_VOIDED', 409);

    const updated = await tx.counterOrder.update({
      where: { id: order.id },
      data: { status: 'OPEN', closedAt: null },
      include: ORDER_INCLUDE,
    });
    return reproject(updated, tx);
  });
}

/**
 * Void an order.
 *
 * The row survives — a voided token is a thing that happened, and the token
 * number must not be handed out again. The projection flips the transaction to
 * VOIDED, which `getSalesSummary`'s existing `status: 'COMPLETED'` filter
 * already excludes with no new code anywhere.
 */
async function voidOrder(businessId, counterOrderId) {
  return prisma.$transaction(async (tx) => {
    const order = await loadEditable(businessId, counterOrderId, tx);
    const updated = await tx.counterOrder.update({
      where: { id: order.id },
      data: { status: 'VOID' },
      include: ORDER_INCLUDE,
    });
    return reproject(updated, tx);
  });
}

/**
 * The most a day's list returns. A busy shop issues a couple of hundred tokens a
 * day, and this list is fetched every time the counter comes into focus, each
 * order with its lines; the day's totals come from `getDaySummary`, which counts
 * every order whatever this cuts off.
 */
const MAX_DAY_ORDERS = 200;

/** Today's orders at a branch, newest token first. */
async function listOrders(businessId, branchId, { date, status } = {}) {
  const branch = await branchOf(businessId, branchId);
  const tokenDate = date ? dateOnly(date) : branchToday(branch);

  return prisma.counterOrder.findMany({
    where: { businessId, branchId, tokenDate, ...(status ? { status } : {}) },
    include: ORDER_INCLUDE,
    orderBy: { tokenNumber: 'desc' },
    take: MAX_DAY_ORDERS,
  });
}

async function getOrder(businessId, counterOrderId) {
  const order = await prisma.counterOrder.findFirst({
    where: { id: counterOrderId, businessId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw fail('COUNTER_ORDER_NOT_FOUND', 404);
  return order;
}

/**
 * Who a customer pays at this branch's counter (requirement 32): the branch's
 * own UPI ID when it has one — a franchise shop collecting into its own
 * account — otherwise the business's. Null when neither is set, and the counter
 * then offers cash only and says why.
 *
 * Resolved here, once, so the phone never has to know the rule; it caches the
 * answer with the rest of the day's context and works offline from that.
 */
function counterPayeeOf(branch, business) {
  if (branch.counterUpiId) {
    return { upiId: branch.counterUpiId, name: branch.counterUpiName || business.name };
  }
  if (business.counterUpiId) {
    return { upiId: business.counterUpiId, name: business.counterUpiName || business.name };
  }
  return null;
}

/**
 * The day at a branch's counter, and everything the phone needs to keep billing
 * through a lost connection — requirements 1, 29 and 30.
 *
 * "The money keeps counting": the totals, from aggregates rather than by
 * loading every order and its lines. Voided orders are excluded from the money
 * but counted separately, because "we voided eleven tokens today" is
 * information a manager wants and a silent omission is not.
 *
 * And the counter's context, which the phone caches:
 * - `lastTokenNumber`, so offline tokens continue from the right number;
 * - `utcOffsetMinutes` and `serverNow`, so the phone can tell which day it is
 *   at the branch (and how wrong its own clock is) with no time-zone database;
 * - `payee`, who the counter's UPI QR pays;
 * - `receiptHeader`, the name, address and phone printed on every token;
 * - `expenses`, the day's spending — only when the caller may read it.
 */
async function getDaySummary(businessId, branchId, { date, includeExpenses = false } = {}) {
  const branch = await branchOf(businessId, branchId);
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const tokenDate = date ? dateOnly(date) : branchToday(branch);
  const day = { businessId, branchId, tokenDate };

  const [byStatus, byMethod, itemCount, counter, closed, spent] = await Promise.all([
    prisma.counterOrder.groupBy({
      by: ['status'],
      where: day,
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.counterOrder.groupBy({
      by: ['paymentMethod'],
      where: { ...day, status: { not: 'VOID' } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.counterOrderItem.count({ where: { counterOrder: { ...day, status: { not: 'VOID' } } } }),
    prisma.branchTokenCounter.findUnique({ where: { branchId_tokenDate: { branchId, tokenDate } } }),
    prisma.dayClose.findUnique({ where: { branchId_date: { branchId, date: tokenDate } } }),
    includeExpenses
      ? prisma.expense.aggregate({
          where: { businessId, branchId, expenseDate: tokenDate },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : null,
  ]);

  const countOf = (status) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const total = byStatus
    .filter((row) => row.status !== 'VOID')
    .reduce((sum, row) => sum.plus(toDecimal(row._sum.totalAmount ?? 0)), new Prisma.Decimal(0));
  const now = new Date();

  return {
    branchId,
    date: tokenDate,
    currency: branch.currency || business.defaultCurrency,
    orderCount: countOf('OPEN') + countOf('CLOSED'),
    openCount: countOf('OPEN'),
    voidCount: countOf('VOID'),
    itemCount,
    totalAmount: total,
    byPaymentMethod: byMethod.map((row) => ({
      paymentMethod: row.paymentMethod,
      orderCount: row._count._all,
      totalAmount: row._sum.totalAmount ?? new Prisma.Decimal(0),
    })),
    isClosed: !!closed,
    closedAt: closed?.closedAt ?? null,
    lastTokenNumber: counter?.lastNumber ?? 0,
    todayKey: dateKeyOf(branchToday(branch)),
    // Whole minutes: the wall clock is read to the second, so an instant with
    // milliseconds would otherwise come back as 329.997 rather than 330.
    utcOffsetMinutes: Math.round(offsetMinutesAt(now, safeZone(branch.timezone))),
    serverNow: now,
    payee: counterPayeeOf(branch, business),
    receiptHeader: {
      businessName: business.name,
      branchName: branch.name,
      branchCode: branch.code,
      addressLine: branch.addressLine,
      phone: branch.phone,
    },
    expenses: spent
      ? { totalAmount: spent._sum.amount ?? new Prisma.Decimal(0), count: spent._count._all }
      : null,
  };
}

/**
 * Close the day. After this, nothing from it can be edited.
 *
 * Refuses while orders are still open, because an open token is one that has
 * not been handed over — closing around it would freeze a half-finished sale
 * into the day's figures.
 */
async function closeDay(businessId, branchId, { date, membershipId } = {}) {
  const branch = await branchOf(businessId, branchId);
  const tokenDate = date ? dateOnly(date) : branchToday(branch);

  const existing = await prisma.dayClose.findUnique({
    where: { branchId_date: { branchId, date: tokenDate } },
  });
  if (existing) throw fail('DAY_ALREADY_CLOSED', 409);

  const open = await prisma.counterOrder.count({
    where: { businessId, branchId, tokenDate, status: 'OPEN' },
  });
  if (open > 0) throw fail('DAY_HAS_OPEN_ORDERS', 409, { count: open });

  return prisma.dayClose.create({
    data: { businessId, branchId, date: tokenDate, closedByMembershipId: membershipId ?? null },
  });
}

/**
 * Reopen a closed day.
 *
 * Deliberately available, and deliberately not free: someone has to ask for it,
 * and it is recorded by its absence rather than kept as history. A day closed
 * by mistake at 18:00 with two hours of trading left must be recoverable, or
 * the floor becomes a trap rather than a guard.
 */
async function reopenDay(businessId, branchId, { date } = {}) {
  const branch = await branchOf(businessId, branchId);
  const tokenDate = date ? dateOnly(date) : branchToday(branch);

  const existing = await prisma.dayClose.findUnique({
    where: { branchId_date: { branchId, date: tokenDate } },
  });
  if (!existing) throw fail('DAY_NOT_CLOSED', 404);

  return prisma.dayClose.delete({ where: { id: existing.id } });
}

module.exports = {
  ORDER_INCLUDE,
  assertDayOpen,
  branchOf,
  reproject,
  toDecimal,
  counterPayeeOf,
  openOrder,
  addItem,
  updateItem,
  removeItem,
  closeOrder,
  reopenOrder,
  voidOrder,
  listOrders,
  getOrder,
  getDaySummary,
  closeDay,
  reopenDay,
  branchToday,
};
