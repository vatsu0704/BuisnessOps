const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const { dateOnly, todayKeyInZone, safeZone } = require('../utils/datetime');
const { writeTransaction, counterExternalId } = require('./salesProjection.service');
const { withEffectivePricing } = require('./product.service');

/**
 * Counter billing — requirement 1.
 *
 * "As orders come in the cashier adds them, issues a token, and the money keeps
 * counting. Once an order is taken they can also edit it."
 *
 * Deliberately NOT a purchase flow: no cart, no payment step, no fulfilment.
 * It counts items, issues a token and totals the money.
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

/** Today's orders at a branch, newest token first. */
async function listOrders(businessId, branchId, { date, status } = {}) {
  const branch = await branchOf(businessId, branchId);
  const tokenDate = date ? dateOnly(date) : branchToday(branch);

  return prisma.counterOrder.findMany({
    where: { businessId, branchId, tokenDate, ...(status ? { status } : {}) },
    include: ORDER_INCLUDE,
    orderBy: { tokenNumber: 'desc' },
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
 * The day's running totals — "the money keeps counting" from requirement 1.
 *
 * Voided orders are excluded from the money but counted separately, because
 * "we voided eleven tokens today" is information a manager wants and a silent
 * omission is not.
 */
async function getDaySummary(businessId, branchId, { date } = {}) {
  const branch = await branchOf(businessId, branchId);
  const tokenDate = date ? dateOnly(date) : branchToday(branch);

  const orders = await prisma.counterOrder.findMany({
    where: { businessId, branchId, tokenDate },
    include: ORDER_INCLUDE,
  });

  const counted = orders.filter((order) => order.status !== 'VOID');
  const total = counted.reduce((sum, order) => sum.plus(toDecimal(order.totalAmount)), new Prisma.Decimal(0));
  const itemCount = counted.reduce((sum, order) => sum + order.items.length, 0);

  const closed = await prisma.dayClose.findUnique({ where: { branchId_date: { branchId, date: tokenDate } } });

  return {
    branchId,
    date: tokenDate,
    currency: branch.currency || (await prisma.business.findUnique({ where: { id: businessId } })).defaultCurrency,
    orderCount: counted.length,
    openCount: counted.filter((order) => order.status === 'OPEN').length,
    voidCount: orders.length - counted.length,
    itemCount,
    totalAmount: total,
    isClosed: !!closed,
    closedAt: closed?.closedAt ?? null,
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
