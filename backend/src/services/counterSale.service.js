const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { ApiError, fail } = require('../errors');
const { dateKeyOf, dateOnly, localDateKey, safeZone } = require('../utils/datetime');
const { roleHas, planAllows, cheapestPlanFor } = require('../permissions');
const { canReachBranch } = require('../middleware/staffScope');
const { ORDER_INCLUDE, assertDayOpen, branchOf, reproject, toDecimal } = require('./counterOrder.service');

/**
 * Paid counter sales, sent from the phone — requirements 29 and 30.
 *
 * The counter no longer talks to the server while an order is being rung up.
 * The cashier builds the order on the phone, takes the money (UPI or cash),
 * taps "Payment done", and the phone numbers the token, saves the sale to its
 * own storage, prints the slip, and only then sends it here — immediately when
 * there is a connection, hours later when there was not. This is the ONE path
 * a sale takes, online or offline: an online sale is an offline sale whose queue
 * emptied at once, so there is no second write path to keep honest.
 *
 * ## What makes it safe to send twice
 *
 * Each sale carries `clientRef`, a UUID the phone made, and
 * `@@unique([businessId, clientRef])` is the idempotency. A sale whose answer
 * was lost to a timeout is simply sent again and comes back DUPLICATE with the
 * first copy's token. The sync is state-based rather than a log of operations:
 * the phone says "this sale exists and is CLOSED" (or VOID), and the server
 * makes that true, so a void made offline arrives as the same sale with a new
 * status.
 *
 * ## Tokens made on two phones
 *
 * The phone numbers tokens itself, because a customer needs the number printed
 * the moment they pay, connection or not. It continues from the last number the
 * server told it about, so one phone at one counter (requirement 18's normal
 * case) never collides. Two phones offline at the same branch on the same day
 * can: the second to sync finds its number taken, gets the next free one, and
 * the number it printed is kept as `deviceTokenNumber`, so the slip in the
 * customer's hand still matches a record.
 *
 * ## What is never refused
 *
 * A paid sale is never refused because the catalog moved under it — a product
 * withdrawn or re-priced since the phone last fetched the menu. The money was
 * taken at that price; the record says so. (This is the one place a price comes
 * from the client, and deliberately: the cashier already holds product:manage.)
 * What IS refused is a sale this person may not record at all — a branch they
 * cannot reach, a day somebody closed — and each refusal is per sale, so one bad
 * sale never holds back the rest of the queue.
 */

/** How far ahead of the server's clock a phone may claim a sale happened. */
const MAX_FUTURE_MS = 2 * 60 * 1000;

/**
 * The capability a void needs, asked the way requirePermission asks it so the
 * refusal reads the same — the roles that hold it, or the plan that unlocks it.
 */
function refusalFor(tenant, capability) {
  if (!roleHas(tenant.role, capability)) return fail('PERMISSION_DENIED', 403, { capability });
  if (!planAllows(tenant.plan, capability)) {
    return fail('PLAN_FEATURE_LOCKED', 403, { capability, requiredPlan: cheapestPlanFor({ capability }) });
  }
  return null;
}

function rejected(clientRef, err) {
  return {
    clientRef,
    outcome: 'REJECTED',
    code: err.code,
    params: err.params ?? {},
  };
}

function settled(clientRef, outcome, order, extra = {}) {
  return {
    clientRef,
    outcome,
    orderId: order.id,
    tokenNumber: order.tokenNumber,
    tokenDate: dateKeyOf(order.tokenDate),
    status: order.status,
    totalAmount: order.totalAmount,
    renumbered: order.deviceTokenNumber !== null && order.deviceTokenNumber !== undefined,
    deviceTokenNumber: order.deviceTokenNumber ?? null,
    clockAdjusted: false,
    ...extra,
  };
}

/** The sale's lines priced by the phone, totalled here — never trusted as sent. */
function linesOf(sale) {
  return sale.items.map((item) => {
    const quantity = toDecimal(item.quantity);
    const unitPrice = toDecimal(item.unitPrice);
    return {
      productId: item.productId ?? null,
      productNameSnapshot: item.name.trim(),
      quantity,
      unitPrice,
      lineTotal: quantity.times(unitPrice),
    };
  });
}

function totalOf(lines) {
  return lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
}

/**
 * Keep a line's product link only when it is a product of this business that
 * this branch sells. A phone with an old menu can name a product since deleted
 * or moved; the sale still happened, so the line keeps its name and loses the
 * link rather than the sale being refused.
 */
async function linkableProductIds(businessId, branchId, lines) {
  const ids = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, businessId, OR: [{ branchId: null }, { branchId }] },
    select: { id: true },
  });
  return new Set(products.map((product) => product.id));
}

/**
 * Lock the branch's token counter for the day and choose the sale's number.
 *
 * The upsert that touches the row is what takes the lock — the same row
 * `allocateToken` increments for the old open-an-order path — so a token chosen
 * here and one allocated there can never be handed out twice. Inside the lock,
 * the phone's number is kept when nobody has it; otherwise the next one after
 * the counter is taken. The counter always ends at least as high as every
 * number in use, which is what makes "next after the counter" always free.
 */
async function chooseToken(tx, branchId, tokenDate, deviceTokenNumber) {
  const [{ lastNumber }] = await tx.$queryRaw`
    INSERT INTO branch_token_counters ("branchId", "tokenDate", "lastNumber")
    VALUES (${branchId}::uuid, ${tokenDate}::date, 0)
    ON CONFLICT ("branchId", "tokenDate")
    DO UPDATE SET "lastNumber" = branch_token_counters."lastNumber"
    RETURNING "lastNumber"`;

  const taken = await tx.counterOrder.findFirst({
    where: { branchId, tokenDate, tokenNumber: deviceTokenNumber },
    select: { id: true },
  });
  if (!taken) {
    if (deviceTokenNumber > lastNumber) {
      await tx.$executeRaw`
        UPDATE branch_token_counters SET "lastNumber" = ${deviceTokenNumber}
        WHERE "branchId" = ${branchId} AND "tokenDate" = ${tokenDate}::date`;
    }
    return { tokenNumber: deviceTokenNumber, renumbered: false };
  }

  const [{ lastNumber: next }] = await tx.$queryRaw`
    UPDATE branch_token_counters SET "lastNumber" = "lastNumber" + 1
    WHERE "branchId" = ${branchId} AND "tokenDate" = ${tokenDate}::date
    RETURNING "lastNumber"`;
  return { tokenNumber: next, renumbered: true };
}

/** The sale already here under this clientRef: the same one again, or a void of it. */
async function settleExisting(existing, sale, lines, ctx) {
  const sameSale = existing.branchId === sale.branchId && toDecimal(existing.totalAmount).equals(totalOf(lines));
  if (!sameSale) return rejected(sale.clientRef, fail('COUNTER_SALE_REF_CONFLICT', 409));

  if (sale.status !== 'VOID' || existing.status === 'VOID') {
    return settled(sale.clientRef, 'DUPLICATE', existing);
  }

  const refusal = refusalFor(ctx.tenant, 'counterOrder:void');
  if (refusal) return rejected(sale.clientRef, refusal);
  await assertDayOpen(existing.branchId, existing.tokenDate);

  const voided = await prisma.$transaction(async (tx) => {
    const updated = await tx.counterOrder.update({
      where: { id: existing.id },
      data: { status: 'VOID' },
      include: ORDER_INCLUDE,
    });
    return reproject(updated, tx);
  });
  return settled(sale.clientRef, 'ACCEPTED', voided);
}

async function syncOne(businessId, ctx, sale) {
  if (!canReachBranch(ctx.scope, sale.branchId)) {
    return rejected(sale.clientRef, fail('BRANCH_ACCESS_DENIED', 403));
  }
  const branch = await branchOf(businessId, sale.branchId);
  const lines = linesOf(sale);

  const existing = await prisma.counterOrder.findUnique({
    where: { businessId_clientRef: { businessId, clientRef: sale.clientRef } },
    include: ORDER_INCLUDE,
  });
  if (existing) return settleExisting(existing, sale, lines, ctx);

  if (sale.status === 'VOID') {
    // Voided before it ever reached the server. It is still recorded — the
    // token was printed and handed out, and a gap in the day's numbers that
    // nobody can explain is worse than a voided row that explains it.
    const refusal = refusalFor(ctx.tenant, 'counterOrder:void');
    if (refusal) return rejected(sale.clientRef, refusal);
  }

  const now = new Date();
  let occurredAt = new Date(sale.occurredAt);
  let clockAdjusted = false;
  if (occurredAt.getTime() > now.getTime() + MAX_FUTURE_MS) {
    // A phone whose clock is ahead would otherwise file today's sale under a
    // day that has not happened. The server's clock is the one that is right.
    occurredAt = now;
    clockAdjusted = true;
  }
  const tokenDate = dateOnly(localDateKey(occurredAt, safeZone(branch.timezone)));
  await assertDayOpen(branch.id, tokenDate);

  const linkable = await linkableProductIds(businessId, branch.id, lines);
  const currency = branch.currency || ctx.business.defaultCurrency;

  const order = await prisma.$transaction(async (tx) => {
    const { tokenNumber, renumbered } = await chooseToken(tx, branch.id, tokenDate, sale.deviceTokenNumber);
    const created = await tx.counterOrder.create({
      data: {
        businessId,
        branchId: branch.id,
        tokenNumber,
        tokenDate,
        status: sale.status,
        totalAmount: totalOf(lines),
        currency,
        paymentMethod: sale.paymentMethod,
        // Who made the sale is whoever's session sends it — never the body.
        placedByMembershipId: ctx.membershipId ?? null,
        openedAt: occurredAt,
        closedAt: occurredAt,
        clientRef: sale.clientRef,
        deviceTokenNumber: renumbered ? sale.deviceTokenNumber : null,
        syncedAt: now,
        items: {
          create: lines.map((line) => ({
            ...line,
            productId: line.productId && linkable.has(line.productId) ? line.productId : null,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });
    // Same projection as every other counter order, so the sale reaches
    // Transaction/LineItem — and Reports — inside this transaction.
    return reproject(created, tx);
  });

  return settled(sale.clientRef, 'ACCEPTED', order, { clockAdjusted });
}

/**
 * Record a batch of sales, one at a time and each in its own transaction, so a
 * sale that is refused never takes the others with it. Results come back in the
 * order the sales were sent.
 *
 * A failure that is not a refusal — the database going away mid-batch — is
 * thrown, and the whole batch is retried later. That is safe because every sale
 * in it is idempotent: the ones that landed come back DUPLICATE.
 */
async function syncSales(businessId, { scope, tenant, membershipId, sales }) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { defaultCurrency: true },
  });
  const ctx = { scope, tenant, membershipId, business };

  const results = [];
  for (const sale of sales) {
    try {
      results.push(await syncOne(businessId, ctx, sale));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Two copies of the same sale arrived at once and the other one won.
        const winner = await prisma.counterOrder.findUnique({
          where: { businessId_clientRef: { businessId, clientRef: sale.clientRef } },
          include: ORDER_INCLUDE,
        });
        if (winner) {
          results.push(settled(sale.clientRef, 'DUPLICATE', winner));
          continue;
        }
      }
      if (err instanceof ApiError) {
        results.push(rejected(sale.clientRef, err));
        continue;
      }
      throw err;
    }
  }
  return { serverNow: new Date(), results };
}

module.exports = { syncSales, MAX_FUTURE_MS };
