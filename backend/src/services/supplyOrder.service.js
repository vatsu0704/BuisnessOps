const { randomUUID } = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const { roleHas } = require('../permissions');
const triggers = require('../notifications/triggers');
const { todayInZone } = require('../utils/datetime');
const supplyItemService = require('./supplyItem.service');

/**
 * Supply orders — requirements 3, 5, 5.1, 9, 11 and 12.
 *
 * A branch carts raw material and places an order on one central warehouse
 * desk; the desk accepts, packs and dispatches it; a delivery agent carries it
 * and marks it delivered. Either of them can post a delay with a reason, which
 * the cashier sees. Payment is RECORDED, never collected — see `placeOrder`.
 *
 * ## Three rules everything here follows
 *
 * 1. **The status machine is data, not `if` statements.** `TRANSITIONS` below
 *    is the whole of what may follow what, so an illegal move is refused in one
 *    place rather than by whichever check a given endpoint remembered to write.
 * 2. **Every change writes an event.** `recordEvent` is the single choke point,
 *    which is what makes requirement 5.1's four asks — material tracking, order
 *    tracking, dispatch and payment — one stream rather than four features.
 * 3. **A supply order is a cost, not a sale.** It is deliberately NOT projected
 *    into Transaction/LineItem the way a counter order is. Putting an internal
 *    transfer into the sales fact table would inflate every sales figure in the
 *    product by the value of the flour a branch bought.
 */

/**
 * What may follow what.
 *
 * CANCELLED is reachable from every stage the goods have not left the warehouse
 * in, and from none after: once it is DISPATCHED the only honest endings are
 * DELIVERED or a delay saying where it is. "Cancelling" something already on a
 * bike would leave the branch with stock the system says it never sent.
 */
const TRANSITIONS = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PACKED', 'CANCELLED'],
  PACKED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * What may follow what for an order from a third-party VENDOR (requirement 25).
 *
 * A vendor's goods never pass through the warehouse, so there is nothing to
 * pack and nothing for the business's own agent to dispatch. ACCEPTED here means
 * "sent to the vendor" — the desk forwarding a company-operated branch's order —
 * and it is optional, because a franchise branch orders from the vendor itself.
 * DELIVERED is the BRANCH saying the goods arrived (`receiveOrder`), since the
 * vendor does not use the app and nobody else saw them come.
 *
 * Kept as its own table rather than as `if (order.vendorId)` checks scattered
 * through the verbs below, for rule 1 above: pack, dispatch and agent-deliver
 * are refused for a vendor order because they are not in this table.
 */
const VENDOR_TRANSITIONS = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'DELIVERED', 'CANCELLED'],
  ACCEPTED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** The status machine this order runs on, by who supplies it. */
function transitionsFor(order) {
  return order.vendorId ? VENDOR_TRANSITIONS : TRANSITIONS;
}

/** Stages at which "it is running late" is a thing that can be true. */
const DELAYABLE = new Set(['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED']);

/**
 * Stages at which a run may be handed to an agent, or to a different one.
 *
 * From ACCEPTED, because the desk has taken the order on by then and knows
 * what is going out; up to and including DISPATCHED, because the named agent
 * going home is exactly when a run needs a new carrier. Not after: changing
 * the agent on a DELIVERED order rewrites who delivered it.
 */
const ASSIGNABLE = new Set(['ACCEPTED', 'PACKED', 'DISPATCHED']);

/**
 * Free first. On duty beats unknown beats off duty, then whoever is carrying
 * least, then by name so the list does not reshuffle between two reads.
 *
 * UNKNOWN sits ABOVE off duty deliberately: it means attendance has nothing to
 * say about this person, which is the state every agent is in at a business
 * that does not use punch-in at all. Sinking them to the bottom would bury the
 * whole list for those businesses.
 */
const DUTY_ORDER = { ON_DUTY: 0, UNKNOWN: 1, OFF_DUTY: 2 };

/**
 * Who is paid for this order, and therefore whose UPI QR it shows (requirement
 * 26): the vendor for a vendor order, the business's warehouse UPI otherwise.
 * Both travel with every order, so the cashier paying before placing and the
 * agent showing a QR at the counter read the payee off the order they already
 * have, without a request to an endpoint neither of them can call.
 *
 * A UPI ID is an address to pay INTO — it is printed under every QR code — so
 * handing it to whoever is paying is the point, not a leak.
 */
const PAYEE_SELECT = {
  vendor: { select: { id: true, name: true, phone: true, upiId: true, upiName: true, isActive: true } },
  business: { select: { name: true, supplyUpiId: true, supplyUpiName: true } },
};

const ORDER_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' },
    // Each line's CURRENT supplier, which is what a cart is split by when it is
    // placed (requirement 25) — so the cart screen can group the lines the same
    // way, and show each supplier's QR, before anything is placed. On a placed
    // order the order's own `vendor` is the authority; this is only ever read
    // while it is a DRAFT.
    include: {
      inventoryItem: {
        select: {
          vendorId: true,
          vendor: { select: { id: true, name: true, phone: true, upiId: true, upiName: true, isActive: true } },
        },
      },
    },
  },
  events: {
    orderBy: { createdAt: 'asc' },
    include: { actorMembership: { select: { id: true, role: true, user: { select: { id: true, name: true } } } } },
  },
  // The destination, not merely its name. The delivery agent's order screen is
  // the only place they open, so the address and the coordinates travel with
  // every order rather than costing a second request to a branch endpoint the
  // agent has no capability to call.
  branch: {
    select: {
      id: true,
      name: true,
      code: true,
      // Who pays for the NEXT order (requirement 24) — the cart reads this to
      // decide whether to ask the cashier how they are paying at all. A placed
      // order carries its own snapshot in `operatingModel`.
      operatingModel: true,
      addressLine: true,
      city: true,
      region: true,
      postalCode: true,
      latitude: true,
      longitude: true,
    },
  },
  ...PAYEE_SELECT,
  placedByMembership: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
  deliveryAgentMembership: {
    select: { id: true, role: true, user: { select: { id: true, name: true } } },
  },
};

/**
 * The Payments lists (requirement 27): what an order is for, who it is to and
 * how much — and not its event timeline, which is the bulk of an order and which
 * a list of payments to make never shows.
 */
const PAYMENT_LIST_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
  branch: { select: { id: true, name: true, code: true } },
  ...PAYEE_SELECT,
  placedByMembership: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
};

function toDecimal(value) {
  return new Prisma.Decimal(value);
}

function assertTransition(order, to) {
  const allowed = transitionsFor(order)[order.status] ?? [];
  if (!allowed.includes(to)) {
    throw fail('SUPPLY_ORDER_INVALID_TRANSITION', 409, { from: order.status, to });
  }
}

/**
 * Does whoever RECEIVES this order's money use the app?
 *
 * Requirement 26's rule for when a payment counts as settled: it is confirmed
 * by its receiver if the receiver can confirm it. The warehouse can — its desk
 * or the accountant taps "Received" — so a payment to the warehouse is PAID
 * ("payment sent") until they do. A vendor cannot, so the payer's own record of
 * paying them is final and goes straight to VERIFIED: waiting for a
 * confirmation that can never arrive would leave every vendor payment looking
 * unpaid forever.
 */
function receiverConfirms(order) {
  return !order.vendorId;
}

/** The status a payer's "Payment done" puts this order in. */
function claimedStatus(order) {
  return receiverConfirms(order) ? 'PAID' : 'VERIFIED';
}

/**
 * Does this order reach the warehouse desk?
 *
 * Every warehouse order does. A vendor order does only when the business pays
 * for it centrally (FOCO), because then the desk is who forwards it to the
 * vendor — the original sketch's "warehouse → TPV". A franchise branch orders
 * from its vendor itself, and the desk has nothing to do with it.
 */
function reachesDesk(order) {
  return !order.vendorId || order.operatingModel === 'FOCO';
}

/**
 * Write one line of the order's history.
 *
 * ---------------------------------------------------------------------------
 * Task 7 (Firebase push) hooks in HERE, and nowhere else.
 * ---------------------------------------------------------------------------
 * Every state change in this file goes through this function, so a notification
 * trigger added here covers requirement 8's whole list at once — placed →
 * warehouse, accepted/dispatched/delivered → cashier, delay → cashier, payment
 * verified → cashier. Adding the sends at each call site instead would mean six
 * places to keep in step and one of them silently missed.
 *
 * It is deliberately not stubbed with an empty notifier today: a function that
 * does nothing reads as a function that works.
 */
async function recordEvent(client, supplyOrderId, event) {
  return client.supplyOrderEvent.create({ data: { supplyOrderId, ...event } });
}

/**
 * Allocate the next order number for a business.
 *
 * The same single atomic statement as the counter's token allocator, for the
 * same reason — see `allocateToken` in counterOrder.service.js. The difference
 * is that this one is per BUSINESS and never resets: a token is shouted across
 * a counter and has to stay small, while an order number is quoted days later
 * ("where has 214 got to?") and has to stay unique.
 */
async function allocateOrderNumber(businessId, client) {
  const rows = await client.$queryRaw`
    INSERT INTO supply_order_counters ("businessId", "lastNumber")
    VALUES (${businessId}::uuid, 1)
    ON CONFLICT ("businessId")
    DO UPDATE SET "lastNumber" = supply_order_counters."lastNumber" + 1
    RETURNING "lastNumber"`;
  return rows[0].lastNumber;
}

/**
 * The branch this cart belongs to, and a check that it is one.
 *
 * A WAREHOUSE location does not order raw material: it is where the raw
 * material comes FROM, and an order it placed on itself would arrive at the
 * desk asking the desk to ship to the desk. The guard lives here rather than
 * only in the branch picker, because "the app does not offer it" is not the
 * same as "it cannot happen" — see BranchKind in schema.prisma.
 */
async function branchOf(businessId, branchId) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) throw fail('BRANCH_NOT_FOUND_IN_BUSINESS', 404);
  if (branch.kind === 'WAREHOUSE') throw fail('BRANCH_IS_WAREHOUSE', 400);
  return branch;
}

/** Recompute the total from the lines, so it can never drift from them. */
async function recomputeTotal(client, supplyOrderId) {
  const items = await client.supplyOrderItem.findMany({ where: { supplyOrderId } });
  const total = items.reduce((sum, item) => sum.plus(toDecimal(item.lineTotal)), new Prisma.Decimal(0));
  return client.supplyOrder.update({
    where: { id: supplyOrderId },
    data: { totalAmount: total },
    include: ORDER_INCLUDE,
  });
}

async function getOrder(businessId, supplyOrderId, client = prisma) {
  const order = await client.supplyOrder.findFirst({
    where: { id: supplyOrderId, businessId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw fail('SUPPLY_ORDER_NOT_FOUND', 404);
  return order;
}

/**
 * The branch's open cart, created on first use.
 *
 * One DRAFT per BRANCH rather than per cashier: the branch is what orders, and
 * two people on the same shift adding to one list is the behaviour a kitchen
 * expects. A per-person cart would also strand whatever a cashier had half
 * built when their shift ended.
 *
 * Find-then-create rather than a partial unique index on (branchId) WHERE
 * status = 'DRAFT'. Prisma 5 cannot express one, and the schema's Holiday model
 * already records why hand-adding it in SQL is the wrong trade: permanent drift
 * between schema.prisma and the database. The cost of losing that race is a
 * second cart, which is visible and fixable, not a corrupted order.
 */
async function getOrCreateCart(businessId, branchId) {
  const branch = await branchOf(businessId, branchId);

  // Fast path: the cart almost always exists already, and reading it needs no
  // lock. Only the miss below has to be serialised.
  const open = await prisma.supplyOrder.findFirst({
    where: { businessId, branchId, status: 'DRAFT' },
    include: ORDER_INCLUDE,
  });
  if (open) return open;

  /**
   * Creating one is check-then-write, and the cart is shared by the BRANCH —
   * so two people being in it at once is the normal case, not the exotic one.
   * Unserialised, a cashier and the owner opening Supply in the same moment
   * each found no cart and each made one; from then on they were adding items
   * to different carts, and `findFirst` handed back whichever Postgres felt
   * like. One of the two orders simply went missing. A single person
   * double-tapping, or the screen's focus-refetch firing twice, did it too.
   *
   * The lock is on the BRANCH row, which is what "one cart per branch" is a
   * fact about, and it is taken the same way `cashierAssignment.service.js`
   * takes its locks — that service's note applies here in full: the lock is the
   * guarantee, not the check. A unique index would have been the other way, but
   * the condition is "at most one row per branch *whose status is DRAFT*", and
   * Prisma cannot express a partial unique index in schema.prisma; adding one
   * by hand would leave permanent drift against that file.
   *
   * Everything inside the transaction is keyed on one branch and takes its
   * locks in one order, so two carts for different branches never wait on each
   * other and two for the same branch cannot deadlock.
   */
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM branches WHERE id = ${branchId} FOR UPDATE`;

    // Re-read under the lock. The other request may have committed its cart in
    // the moment between the fast path above and this line, and that cart is
    // now the branch's one cart.
    const existing = await tx.supplyOrder.findFirst({
      where: { businessId, branchId, status: 'DRAFT' },
      include: ORDER_INCLUDE,
    });
    if (existing) return existing;

    const business = await tx.business.findUnique({ where: { id: businessId } });
    return tx.supplyOrder.create({
      data: {
        businessId,
        branchId,
        status: 'DRAFT',
        totalAmount: new Prisma.Decimal(0),
        currency: branch.currency || business.defaultCurrency,
        // No `placedByMembershipId`. A draft has not been placed by anyone, and
        // because the cart is shared by the branch, whoever opens it is often
        // not whoever sends it. Stamping the opener here made the order claim
        // it was "placed by Hari" while its own history said Deep placed it —
        // one act, two names. The column means what it says: it is filled in
        // at PLACED.
      },
      include: ORDER_INCLUDE,
    });
  });
}

/** Only a cart may have its lines changed. Everything after is a record. */
function assertCart(order) {
  if (order.status !== 'DRAFT') throw fail('SUPPLY_ORDER_NOT_EDITABLE', 409, { status: order.status });
}

/**
 * Put something in the cart.
 *
 * The price comes from the catalog, never from the caller — a price the client
 * can name is a price the client can invent. Adding the same item again raises
 * the quantity rather than making a second line, because the person picking the
 * order should not have to add two rows of flour together.
 */
async function addItem(businessId, branchId, { inventoryItemId, quantity }) {
  const { id: cartId } = await getOrCreateCart(businessId, branchId);

  return prisma.$transaction(async (tx) => {
    // Re-read inside the transaction rather than trusting the row fetched
    // above: between the two, a colleague on the same counter may have placed
    // it, and adding a line to an order the warehouse is already picking would
    // ship something nobody agreed to.
    const cart = await getOrder(businessId, cartId, tx);
    assertCart(cart);
    const item = await supplyItemService.resolveOrderable(businessId, inventoryItemId, tx);

    const qty = toDecimal(quantity);
    const price = toDecimal(item.unitPrice);
    const existing = await tx.supplyOrderItem.findFirst({
      where: { supplyOrderId: cart.id, inventoryItemId },
    });

    if (existing) {
      const merged = toDecimal(existing.quantity).plus(qty);
      await tx.supplyOrderItem.update({
        where: { id: existing.id },
        // Re-price on merge: the line is being written now, so it carries
        // today's price rather than the one captured when the cart was opened.
        data: { quantity: merged, unitPrice: price, lineTotal: merged.times(price) },
      });
    } else {
      await tx.supplyOrderItem.create({
        data: {
          supplyOrderId: cart.id,
          inventoryItemId: item.id,
          itemNameSnapshot: item.name,
          unitSnapshot: item.unit,
          quantity: qty,
          unitPrice: price,
          lineTotal: qty.times(price),
        },
      });
    }

    return recomputeTotal(tx, cart.id);
  });
}

/** Change a line. Zero removes it, the way a cart expresses "take it out". */
async function updateItem(businessId, supplyOrderId, itemId, { quantity }) {
  return prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
    assertCart(order);

    const item = await tx.supplyOrderItem.findFirst({ where: { id: itemId, supplyOrderId: order.id } });
    if (!item) throw fail('SUPPLY_ORDER_ITEM_NOT_FOUND', 404);

    const qty = toDecimal(quantity);
    if (qty.isZero()) {
      await tx.supplyOrderItem.delete({ where: { id: item.id } });
    } else {
      await tx.supplyOrderItem.update({
        where: { id: item.id },
        data: { quantity: qty, lineTotal: qty.times(toDecimal(item.unitPrice)) },
      });
    }

    return recomputeTotal(tx, order.id);
  });
}

/**
 * Place the cart — as one order per supplier.
 *
 * ## Why a cart can become several orders (requirement 25)
 *
 * A branch orders chai masala from the warehouse and water from a vendor in one
 * go, which is how a kitchen thinks about it. But each order has exactly ONE
 * payee — a payment QR pays one UPI ID — and a vendor's goods never pass
 * through the warehouse. So the lines are grouped by the supplier of each item
 * at this moment and each group becomes its own order, with its own number and
 * its own payment. The warehouse's lines stay on the cart row; every vendor's
 * move to a new row. They share a `placementId`, which is how the app shows
 * them as the one act of ordering they were.
 *
 * ## Who pays, and when (requirements 24 and 26)
 *
 * Read from the branch NOW and snapshotted onto each order, so a branch moved
 * from FM to FOCO later still owes exactly what it agreed to for this one:
 *
 * - **FOCO**: the business pays, after delivery, from the accountant's Payments
 *   screen. No question is asked here, and any mode a client sends is ignored —
 *   an app build from before requirement 24 still shows the chooser, and the
 *   branch's model is the authority, not the button somebody pressed.
 * - **FM, pay now (ONLINE)**: the cashier paid each payee's QR before pressing
 *   Place and says so (`paymentConfirmed`). Still recorded, never collected —
 *   no gateway, no money through this app. A warehouse order is then PAID
 *   until its receiver confirms; a vendor order is VERIFIED at once, because a
 *   vendor cannot confirm anything (see `receiverConfirms`). A typed reference
 *   is optional now, and an old client that sends one instead of the flag is
 *   taken as having confirmed.
 * - **FM, pay on delivery (COD)**: PENDING until the goods arrive.
 *
 * The order numbers are allocated here rather than at cart creation: numbering
 * carts would burn numbers on orders that never happened and leave gaps the
 * warehouse would ask about.
 */
async function placeOrder(
  businessId,
  supplyOrderId,
  { paymentMode, paymentConfirmed, paymentReference, membershipId }
) {
  const placed = await prisma.$transaction(async (tx) => {
    // Lock the cart first. Placing is check-then-write over several rows now —
    // read the lines, move some to new orders, number them all — and two people
    // pressing Place on the branch's one cart at once would otherwise both see
    // a DRAFT and each split it.
    await tx.$queryRaw`SELECT id FROM supply_orders WHERE id = ${supplyOrderId} FOR UPDATE`;

    const cart = await getOrder(businessId, supplyOrderId, tx);
    assertTransition(cart, 'PLACED');
    if (cart.items.length === 0) throw fail('SUPPLY_ORDER_EMPTY', 400);

    const groups = await groupBySupplier(businessId, cart.items, tx);
    const operatingModel = cart.branch?.operatingModel ?? 'FM';
    const reference = paymentReference?.trim() || null;

    if (operatingModel === 'FM') {
      if (!paymentMode) throw fail('SUPPLY_ORDER_PAYMENT_MODE_REQUIRED', 400);
      if (paymentMode === 'ONLINE') {
        if (paymentConfirmed !== true && !reference) throw fail('SUPPLY_ORDER_PAYMENT_NOT_CONFIRMED', 400);
        // Paying now means paying a QR, and a payee with no UPI ID has no QR.
        // An old client that typed a reference paid some other way, and is not
        // held to a QR it was never shown.
        if (!reference) {
          for (const group of groups) {
            const upiId = group.vendor ? group.vendor.upiId : cart.business?.supplyUpiId;
            if (!upiId) {
              throw fail('SUPPLY_PAYEE_NOT_SET', 400, {
                payee: group.vendor ? group.vendor.name : (cart.business?.name ?? ''),
              });
            }
          }
        }
      }
    }

    const placementId = randomUUID();
    const placedAt = new Date();
    const placedIds = [];

    for (const [index, group] of groups.entries()) {
      const vendorId = group.vendor?.id ?? null;
      const payment = paymentFor({ vendorId }, operatingModel, paymentMode, reference);
      const orderNumber = await allocateOrderNumber(businessId, tx);
      const data = {
        status: 'PLACED',
        orderNumber,
        vendorId,
        operatingModel,
        placementId,
        totalAmount: group.lines.reduce((sum, line) => sum.plus(toDecimal(line.lineTotal)), new Prisma.Decimal(0)),
        paymentMode: payment.paymentMode,
        paymentStatus: payment.paymentStatus,
        paymentReference: payment.paymentReference,
        paymentVerifiedAt: payment.paymentStatus === 'VERIFIED' ? placedAt : null,
        placedAt,
        // Whoever pressed Place, not whoever opened the cart. The branch
        // shares one cart, so preferring the existing value attributed the act
        // to a colleague who may have only added a line to it.
        placedByMembershipId: membershipId ?? null,
      };

      // The first group keeps the cart's own row — and with it every line that
      // was not moved — so a cart with one supplier is placed exactly as it
      // always was. Every other group is a new row its lines move into.
      let orderId = cart.id;
      if (index === 0) {
        await tx.supplyOrder.update({ where: { id: cart.id }, data });
      } else {
        const created = await tx.supplyOrder.create({
          data: { ...data, businessId, branchId: cart.branchId, currency: cart.currency },
        });
        orderId = created.id;
        await tx.supplyOrderItem.updateMany({
          where: { id: { in: group.lines.map((line) => line.id) } },
          data: { supplyOrderId: orderId },
        });
      }

      await recordEvent(tx, orderId, {
        type: 'STATUS_CHANGE',
        fromStatus: 'DRAFT',
        toStatus: 'PLACED',
        actorMembershipId: membershipId ?? null,
      });
      // A separate PAYMENT event, not a field on the one above: the payment story
      // has its own timeline (sent → received, or not received) and the warehouse
      // and accounts read it as one.
      await recordEvent(tx, orderId, {
        type: 'PAYMENT',
        reasonCode: payment.reasonCode,
        note: payment.paymentReference,
        actorMembershipId: membershipId ?? null,
      });
      placedIds.push(orderId);
    }

    const orders = [];
    for (const id of placedIds) orders.push(await getOrder(businessId, id, tx));
    return orders;
  });

  // Outside the transaction on purpose: a push describing an order that then
  // rolled back would be worse than no push at all.
  for (const order of placed) {
    // Requirement 3 — the desk hears about what it has to handle. A franchise
    // branch's vendor order is not that: the branch sends it to the vendor.
    if (reachesDesk(order)) {
      await triggers.orderPlaced(businessId, order, { actorMembershipId: membershipId });
    }
    if (order.paymentStatus === 'PAID') {
      await triggers.paymentSent(businessId, order, { actorMembershipId: membershipId });
    }
  }

  // The first order, as before, so a client that knows nothing of splitting
  // still gets the order it placed — plus every order the cart became.
  return {
    ...placed[0],
    placedOrders: placed.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      vendorId: order.vendorId,
      vendorName: order.vendor?.name ?? null,
      totalAmount: order.totalAmount,
      paymentStatus: order.paymentStatus,
    })),
  };
}

/**
 * How one of the orders a cart becomes is paid, and the timeline row that says
 * so. Data in, data out, so the three cases above read as a table rather than
 * as nested branches inside the loop that writes them.
 */
function paymentFor(order, operatingModel, paymentMode, reference) {
  if (operatingModel === 'FOCO') {
    return { paymentMode: 'ACCOUNTS', paymentStatus: 'PENDING', paymentReference: null, reasonCode: 'PAYMENT_BY_ACCOUNTS' };
  }
  if (paymentMode === 'ONLINE') {
    return {
      paymentMode: 'ONLINE',
      paymentStatus: claimedStatus(order),
      paymentReference: reference,
      reasonCode: receiverConfirms(order) ? 'PAYMENT_CLAIMED' : 'PAYMENT_PAID_VENDOR',
    };
  }
  return { paymentMode: 'COD', paymentStatus: 'PENDING', paymentReference: null, reasonCode: 'PAYMENT_ON_DELIVERY' };
}

/**
 * The cart's lines, grouped by who supplies each one right now.
 *
 * The warehouse first, then vendors by name, so the cart's own row — which keeps
 * the first group — is the warehouse order whenever there is one, and the order
 * numbers come out in an order a person would expect. A line whose catalog item
 * has since been deleted has no supplier to ask, and was ordered from the
 * warehouse by everyone who ever saw it, so it stays there.
 *
 * A vendor withdrawn since the line was added is refused rather than ordered
 * from: an order to a supplier the business has stopped using goes to nobody.
 */
async function groupBySupplier(businessId, lines, client) {
  const itemIds = lines.map((line) => line.inventoryItemId).filter(Boolean);
  const items = await client.inventoryItem.findMany({
    where: { businessId, id: { in: itemIds } },
    select: {
      id: true,
      vendor: { select: { id: true, name: true, isActive: true, upiId: true } },
    },
  });
  const vendorByItem = new Map(items.map((item) => [item.id, item.vendor]));

  const groups = new Map();
  for (const line of lines) {
    const vendor = (line.inventoryItemId && vendorByItem.get(line.inventoryItemId)) || null;
    if (vendor && !vendor.isActive) throw fail('SUPPLY_VENDOR_INACTIVE', 400, { name: vendor.name });
    const key = vendor?.id ?? 'WAREHOUSE';
    if (!groups.has(key)) groups.set(key, { vendor, lines: [] });
    groups.get(key).lines.push(line);
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.vendor) return -1;
    if (!b.vendor) return 1;
    return a.vendor.name.localeCompare(b.vendor.name);
  });
}

/**
 * Move the order one step along.
 *
 * Accept, pack, dispatch and deliver are the same operation with a different
 * destination, so they are one function rather than four near-copies that drift
 * apart. What differs per step is expressed as data by the callers below.
 */
async function advance(
  businessId,
  supplyOrderId,
  toStatus,
  { membershipId, extraData = {}, note, events = [] } = {}
) {
  const updated = await prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
    assertTransition(order, toStatus);

    await tx.supplyOrder.update({ where: { id: order.id }, data: { status: toStatus, ...extraData } });
    await recordEvent(tx, order.id, {
      type: 'STATUS_CHANGE',
      fromStatus: order.status,
      toStatus,
      note: note ?? null,
      actorMembershipId: membershipId ?? null,
    });
    // Anything else that happened in the same act, in the same transaction.
    // Dispatching WITH an agent is two facts — it left, and Ravi took it — and
    // recording the second outside this would allow an order on the road whose
    // own history says nobody was ever given it.
    for (const event of events) {
      await recordEvent(tx, order.id, event);
    }

    return getOrder(businessId, order.id, tx);
  });

  // Requirement 11 — one hook covers accept, pack, dispatch and deliver,
  // because this function is the only way any of them happen.
  await triggers.orderStatusChanged(businessId, updated, toStatus, {
    actorMembershipId: membershipId,
  });
  // Requirement 27: accounts pays for a FOCO branch's order once it has
  // arrived, and finds out it has arrived here — whether the agent delivered it
  // or the branch received it from a vendor, this is the one way either happens.
  if (toStatus === 'DELIVERED' && updated.paymentMode === 'ACCOUNTS' && updated.paymentStatus === 'PENDING') {
    await triggers.orderReadyToPay(businessId, updated, { actorMembershipId: membershipId });
  }
  return updated;
}

/**
 * The warehouse takes the order on, optionally promising a time.
 *
 * `promisedAt` is optional because requirement 9 only asks for relative delays
 * ("+30 minutes, traffic"), which are recorded either way. When a promise HAS
 * been made, every delay pushes it, so the cashier reads one moving time
 * instead of doing the arithmetic themselves.
 *
 * For a VENDOR order this is the desk saying it has sent the order on to the
 * vendor (requirement 25) — the same step in the same place, since in both
 * cases it means "the desk has taken this on", so it is the same verb rather
 * than a second endpoint that would have to be kept in step with this one.
 */
async function acceptOrder(businessId, supplyOrderId, { promisedAt, membershipId }) {
  return advance(businessId, supplyOrderId, 'ACCEPTED', {
    membershipId,
    extraData: promisedAt ? { promisedAt: new Date(promisedAt) } : {},
  });
}

async function packOrder(businessId, supplyOrderId, { membershipId }) {
  return advance(businessId, supplyOrderId, 'PACKED', { membershipId });
}

/**
 * The member a run may be handed to.
 *
 * Checked against the capability matrix rather than against a role name, so
 * handing a run to someone who cannot mark it delivered is refused at the point
 * of assignment instead of becoming a stuck order nobody can close.
 */
async function resolveAgent(businessId, deliveryAgentMembershipId, client = prisma) {
  const agent = await client.membership.findFirst({
    where: { id: deliveryAgentMembershipId, businessId, status: 'ACTIVE' },
    select: { id: true, role: true, user: { select: { name: true } } },
  });
  if (!agent) throw fail('SUPPLY_ORDER_AGENT_NOT_FOUND', 404);
  if (!roleHas(agent.role, 'supplyOrder:deliver')) throw fail('SUPPLY_ORDER_AGENT_NOT_PERMITTED', 400);
  return agent;
}

/**
 * The timeline row for "this run is now Ravi's".
 *
 * The agent's NAME is snapshotted into `note`, the way an order line snapshots
 * the item name: the history has to still read correctly after that person is
 * renamed or leaves the business. A name is not prose for the device to
 * translate — there is no sentence here, only the name the device puts inside a
 * sentence of its own — so this is not what the no-backend-strings rule guards
 * against.
 */
function assignmentEvent(agent, membershipId) {
  return {
    type: 'ASSIGNMENT',
    note: agent.user?.name ?? null,
    actorMembershipId: membershipId ?? null,
  };
}

/**
 * Send it out, naming who is carrying it.
 *
 * The agent stays optional here, deliberately. A business with no delivery
 * agent yet still has to be able to ship, and an unnamed run is visible to
 * every agent covering that branch (see `listDeliveryOrders`) rather than
 * disappearing. The desk's screen offers the free agents first and "nobody yet"
 * second, which is a better answer than a server refusing a dispatch it has no
 * alternative for.
 */
async function dispatchOrder(businessId, supplyOrderId, { deliveryAgentMembershipId, membershipId }) {
  const agent = deliveryAgentMembershipId
    ? await resolveAgent(businessId, deliveryAgentMembershipId)
    : null;

  return advance(businessId, supplyOrderId, 'DISPATCHED', {
    membershipId,
    extraData: {
      dispatchedAt: new Date(),
      ...(agent ? { deliveryAgentMembershipId: agent.id } : {}),
    },
    events: agent ? [assignmentEvent(agent, membershipId)] : [],
  });
}

/**
 * Hand the run to an agent — or to a different one.
 *
 * Its own verb rather than only a field on dispatch, because "who is taking it"
 * and "it has left" are different facts with different timing. The desk gives a
 * packed order to whoever is free; the agent it was given to goes home an hour
 * later and it has to go to somebody else. With only the dispatch field, the
 * one way to correct an assignment would be to undo a dispatch that really
 * happened.
 *
 * Assigning the same agent twice is a no-op rather than a second timeline row:
 * a history saying a run was given to Ravi and then given to Ravi is a history
 * nobody reads twice.
 */
async function assignOrder(businessId, supplyOrderId, { deliveryAgentMembershipId, membershipId }) {
  const { order: assigned, agentId } = await prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
    // A vendor brings its own goods. Naming one of the business's agents on it
    // would put a run in their queue that they have nothing to carry.
    if (order.vendorId) throw fail('SUPPLY_ORDER_VENDOR_ORDER', 409);
    if (!ASSIGNABLE.has(order.status)) {
      throw fail('SUPPLY_ORDER_ASSIGN_NOT_APPLICABLE', 409, { status: order.status });
    }

    const agent = await resolveAgent(businessId, deliveryAgentMembershipId, tx);
    // Already theirs: nothing changed, so nobody is told again.
    if (order.deliveryAgentMembershipId === agent.id) return { order, agentId: null };

    await tx.supplyOrder.update({
      where: { id: order.id },
      data: { deliveryAgentMembershipId: agent.id },
    });
    await recordEvent(tx, order.id, assignmentEvent(agent, membershipId));

    return { order: await getOrder(businessId, order.id, tx), agentId: agent.id };
  });

  // Requirement 21's missing half: the run appeared in their queue, and
  // nothing had ever told them it was there.
  if (agentId) {
    await triggers.orderAssigned(businessId, assigned, agentId, { actorMembershipId: membershipId });
  }
  return assigned;
}

/**
 * Who the desk may hand a run to, and who is free to take one.
 *
 * Deliberately NOT the team list. The warehouse desk holds no `team:view` — it
 * ships to every branch and has no business reading their people — so this
 * returns the narrowest thing that answers "who can carry this, and who is
 * free": a membership id, a name, a duty state and a count. No email, no
 * branches, no employment record.
 *
 * **Whose JOB is delivering is not the same question as who is ABLE to
 * deliver.** An admin holds every capability, so a bare `supplyOrder:deliver`
 * filter would list the owner and every admin as a courier. The discriminator
 * is `supplyOrder:fulfil`: someone who can run the desk is not who the desk is
 * looking for. Both halves are read off the capability matrix, so a role added
 * later that carries but does not fulfil appears here with no edit — and it is
 * an allow-list with a discriminator, not a deny-list keyed on a role name.
 *
 * Availability is reported, never enforced. Attendance is the only honest
 * source for "on shift", and it has nothing to say about an agent with no staff
 * record, or about a business that does not use punch-in at all. So an
 * off-duty agent is still assignable and simply sorts last: the desk knows
 * things this process does not.
 */
async function listDeliveryAgents(businessId) {
  const memberships = await prisma.membership.findMany({
    where: { businessId, status: 'ACTIVE' },
    select: { id: true, role: true, userId: true, user: { select: { name: true } } },
  });
  const agents = memberships.filter(
    (member) => roleHas(member.role, 'supplyOrder:deliver') && !roleHas(member.role, 'supplyOrder:fulfil')
  );
  if (agents.length === 0) return [];

  // What each is already carrying. DISPATCHED only: a delivered run is not a
  // load, and one still at the desk has not left with anybody.
  const loads = await prisma.supplyOrder.groupBy({
    by: ['deliveryAgentMembershipId'],
    where: {
      businessId,
      status: 'DISPATCHED',
      deliveryAgentMembershipId: { in: agents.map((agent) => agent.id) },
    },
    _count: { _all: true },
  });
  const loadBy = new Map(loads.map((row) => [row.deliveryAgentMembershipId, row._count._all]));

  // Whether someone is on shift is the attendance module's answer, not a second
  // one invented here: a punch-in with no punch-out is someone currently at
  // work. "Today" is the branch's own calendar day, as everywhere else that
  // reads attendance — see utils/datetime.js.
  const staff = await prisma.staffMember.findMany({
    where: { businessId, status: 'ACTIVE', userId: { in: agents.map((agent) => agent.userId) } },
    select: { id: true, userId: true, name: true, branch: { select: { timezone: true } } },
  });
  const records = staff.length
    ? await prisma.attendance.findMany({
        where: {
          businessId,
          OR: staff.map((person) => ({
            staffMemberId: person.id,
            date: todayInZone(person.branch.timezone),
          })),
        },
        select: { staffMemberId: true, punchInAt: true, punchOutAt: true },
      })
    : [];

  const staffByUser = new Map(staff.map((person) => [person.userId, person]));
  const recordByStaff = new Map(records.map((record) => [record.staffMemberId, record]));

  return agents
    .map((agent) => {
      const person = staffByUser.get(agent.userId) ?? null;
      const record = person ? (recordByStaff.get(person.id) ?? null) : null;
      const dutyState = !person
        ? 'UNKNOWN'
        : record?.punchInAt && !record.punchOutAt
          ? 'ON_DUTY'
          : 'OFF_DUTY';

      return {
        membershipId: agent.id,
        // The account name, falling back to the employment record's — the same
        // person, and one of the two is filled in.
        name: agent.user?.name ?? person?.name ?? null,
        dutyState,
        onDutySince: dutyState === 'ON_DUTY' ? record.punchInAt : null,
        activeRuns: loadBy.get(agent.id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (DUTY_ORDER[a.dutyState] !== DUTY_ORDER[b.dutyState]) {
        return DUTY_ORDER[a.dutyState] - DUTY_ORDER[b.dutyState];
      }
      if (a.activeRuns !== b.activeRuns) return a.activeRuns - b.activeRuns;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
}

/**
 * Mark it delivered — requirement 12. Warehouse orders only; a vendor's goods
 * are received by the branch (`receiveOrder`), since no agent of ours carried
 * them.
 *
 * A COD order becomes PAID at this moment and not before, because that is when
 * the money actually changes hands. An ONLINE one is left exactly as the
 * warehouse's verification left it: delivering something is not evidence that
 * its payment cleared. A FOCO order (`ACCOUNTS`) is delivered with nothing
 * asked at all — accounts pays for it afterwards, and `advance` tells them it is
 * ready to be paid for.
 *
 * ## Cash on delivery is confirmed, not assumed (requirement 22)
 *
 * Delivering used to stamp a COD order PAID as a side effect of arriving, which
 * quietly recorded that the branch's cash had reached the warehouse on the
 * strength of the goods reaching the branch. Those are two different events,
 * and only the agent standing at the counter knows whether the second one
 * happened. So the person closing the run has to say so, and the refusal is
 * the point: an unpaid order that says PAID is money nobody will go looking for.
 *
 * Requirement 26 adds a second way to hand it over: the agent shows the
 * warehouse's UPI QR on their own phone and the cashier scans it with theirs.
 * So the answer is now HOW it was taken — `collectedVia: 'CASH' | 'UPI'` — and
 * the older `cashCollected: true` from an app build that only knew about cash
 * arrives here already translated to CASH by the controller. Either way it is
 * PAID rather than settled: whether it actually reached the warehouse is the
 * warehouse's to confirm.
 *
 * The answer is required only while there is money outstanding. An ONLINE
 * order, or a COD one already paid, is delivered with no question asked,
 * because asking one whose answer cannot matter teaches people to tap through it.
 */
async function deliverOrder(businessId, supplyOrderId, { membershipId, scope, collectedVia }) {
  const order = await getOrder(businessId, supplyOrderId);
  if (order.vendorId) throw fail('SUPPLY_ORDER_VENDOR_ORDER', 409);

  // A named agent's run is theirs. Someone who can fulfil orders — the desk, an
  // admin — can still close it, for the case where a branch collected it itself.
  if (
    order.deliveryAgentMembershipId &&
    order.deliveryAgentMembershipId !== membershipId &&
    !roleHas(scope.role, 'supplyOrder:fulfil')
  ) {
    throw fail('SUPPLY_ORDER_NOT_ASSIGNED', 403);
  }

  const cashOutstanding = order.paymentMode === 'COD' && order.paymentStatus === 'PENDING';
  if (cashOutstanding && !collectedVia) {
    throw fail('SUPPLY_ORDER_CASH_NOT_CONFIRMED', 400);
  }

  const delivered = await advance(businessId, supplyOrderId, 'DELIVERED', {
    membershipId,
    extraData: {
      deliveredAt: new Date(),
      ...(cashOutstanding ? { paymentStatus: 'PAID' } : {}),
    },
    // The money is its own event, beside the delivery rather than inside it.
    // The payment story already has a timeline of its own — sent, received,
    // not received — and "the agent took it" is the COD entry in it. Without
    // this row, a COD order's history showed it becoming PAID with nothing
    // anywhere saying who took the money, or how.
    events: cashOutstanding
      ? [
          {
            type: 'PAYMENT',
            reasonCode: collectedVia === 'UPI' ? 'PAYMENT_COLLECTED_UPI' : 'PAYMENT_COLLECTED',
            actorMembershipId: membershipId ?? null,
          },
        ]
      : [],
  });

  if (cashOutstanding) await triggers.paymentSent(businessId, delivered, { actorMembershipId: membershipId });
  return delivered;
}

/**
 * The branch says a VENDOR's goods arrived — requirement 25.
 *
 * Its own verb rather than `deliverOrder` with a different caller, because it is
 * a different fact told by a different person: nobody of ours carried these, so
 * the branch is the only one who saw them come. Hence its own capability too,
 * `supplyOrder:receive`, held by the cashier.
 *
 * A franchise branch paying on delivery has just paid the vendor's own delivery
 * person, or has not, and is asked which (`vendorPaid`) — the same reason the
 * agent is asked about cash. Paid (by cash, or by scanning the vendor's QR) is
 * final at once, since a vendor cannot confirm anything in this app; "not yet"
 * leaves it PENDING with a Pay button on the order. A FOCO branch is asked
 * nothing: accounts pays, and `advance` tells them it is ready to be paid for.
 */
async function receiveOrder(businessId, supplyOrderId, { membershipId, vendorPaid }) {
  const order = await getOrder(businessId, supplyOrderId);
  if (!order.vendorId) throw fail('SUPPLY_ORDER_NOT_VENDOR_ORDER', 409);

  const owed = order.paymentMode === 'COD' && order.paymentStatus === 'PENDING';
  if (owed && !vendorPaid) throw fail('SUPPLY_ORDER_VENDOR_PAYMENT_UNANSWERED', 400);
  const paidNow = owed && (vendorPaid === 'CASH' || vendorPaid === 'UPI');

  return advance(businessId, supplyOrderId, 'DELIVERED', {
    membershipId,
    extraData: {
      deliveredAt: new Date(),
      ...(paidNow ? { paymentStatus: 'VERIFIED', paymentVerifiedAt: new Date() } : {}),
    },
    events: paidNow
      ? [
          {
            type: 'PAYMENT',
            reasonCode: vendorPaid === 'CASH' ? 'PAYMENT_PAID_VENDOR_CASH' : 'PAYMENT_PAID_VENDOR',
            actorMembershipId: membershipId ?? null,
          },
        ]
      : [],
  });
}

/**
 * A franchise branch pays for an order after placing it — requirement 26.
 *
 * Three cases end up here, and they are one operation: paying on delivery came
 * round before the goods did and the cashier would rather pay now; the
 * warehouse said a payment had not arrived (FAILED) and the branch pays again;
 * the vendor's goods were received with "not yet paid" and now they have been.
 *
 * The same rule decides what it becomes as everywhere else: PAID while the
 * warehouse still has to confirm it, VERIFIED at once for a vendor.
 *
 * Cash is accepted for a vendor — the cashier handed it to the vendor's own
 * person — and refused for the warehouse, whose cash goes to the delivery agent
 * at the counter and is recorded there (requirement 22), not claimed from the
 * branch's side. An `ACCOUNTS` order is never the branch's to pay.
 */
async function recordPayment(businessId, supplyOrderId, { method, paymentReference, membershipId }) {
  const paid = await prisma.$transaction(async (tx) => {
    // Locked, so a double-tap — or the cashier and the agent settling the same
    // order from two phones — is one payment, not two rows saying it was paid.
    await tx.$queryRaw`SELECT id FROM supply_orders WHERE id = ${supplyOrderId} FOR UPDATE`;
    const order = await getOrder(businessId, supplyOrderId, tx);

    if (order.paymentMode === 'ACCOUNTS') throw fail('SUPPLY_ORDER_SETTLED_BY_ACCOUNTS', 409);
    if (!['PENDING', 'FAILED'].includes(order.paymentStatus) || ['DRAFT', 'CANCELLED'].includes(order.status)) {
      throw fail('SUPPLY_ORDER_PAYMENT_NOT_OPEN', 409);
    }
    if (method === 'CASH' && receiverConfirms(order)) throw fail('SUPPLY_ORDER_CASH_NEEDS_AGENT', 400);

    const status = claimedStatus(order);
    const reference = paymentReference?.trim() || null;
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: status,
        ...(reference ? { paymentReference: reference } : {}),
        paymentVerifiedAt: status === 'VERIFIED' ? new Date() : null,
      },
    });
    await recordEvent(tx, order.id, {
      type: 'PAYMENT',
      reasonCode: receiverConfirms(order)
        ? 'PAYMENT_CLAIMED'
        : method === 'CASH'
          ? 'PAYMENT_PAID_VENDOR_CASH'
          : 'PAYMENT_PAID_VENDOR',
      note: reference,
      actorMembershipId: membershipId ?? null,
    });

    return getOrder(businessId, order.id, tx);
  });

  if (paid.paymentStatus === 'PAID') await triggers.paymentSent(businessId, paid, { actorMembershipId: membershipId });
  return paid;
}

/**
 * The branch changes its mind.
 *
 * Only while the warehouse has not committed to it. Once accepted, someone has
 * started picking, and withdrawing it is the desk's call — `rejectOrder`.
 */
async function cancelOrder(businessId, supplyOrderId, { membershipId, note }) {
  const order = await getOrder(businessId, supplyOrderId);
  if (!['DRAFT', 'PLACED'].includes(order.status)) {
    throw fail('SUPPLY_ORDER_CANCEL_TOO_LATE', 409, { status: order.status });
  }
  return advance(businessId, supplyOrderId, 'CANCELLED', {
    membershipId,
    note: note ?? null,
    extraData: { cancelledAt: new Date() },
  });
}

/**
 * The warehouse cannot fill it.
 *
 * A separate verb from `cancelOrder` on purpose: "the branch changed its mind"
 * and "the warehouse has no stock" are different events with different people
 * to tell, and collapsing them into one endpoint would lose which happened. The
 * reason is required here and optional there for the same reason.
 */
async function rejectOrder(businessId, supplyOrderId, { reasonCode, note, membershipId }) {
  return prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
    assertTransition(order, 'CANCELLED');

    await tx.supplyOrder.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    // The status change and why it happened are one event here, unlike a
    // cancellation, because the reason is the whole content of a rejection.
    await recordEvent(tx, order.id, {
      type: 'STATUS_CHANGE',
      fromStatus: order.status,
      toStatus: 'CANCELLED',
      reasonCode,
      note: note ?? null,
      actorMembershipId: membershipId ?? null,
    });

    return getOrder(businessId, order.id, tx);
  });
}

/**
 * "+30 minutes, traffic" — requirement 9, posted by the warehouse or by the
 * delivery agent, and read by the cashier.
 *
 * `reasonCode` is a code rather than a sentence, for the same reason the error
 * catalog is: this process cannot know whether the cashier reading it has the
 * app in Gujarati. The device renders `t('supplyDelay.<CODE>')`. `note` beside
 * it is the actor's own words and is shown as typed.
 */
async function postDelay(businessId, supplyOrderId, { delayMinutes, reasonCode, note, membershipId }) {
  const delayed = await prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
    if (!DELAYABLE.has(order.status)) {
      throw fail('SUPPLY_ORDER_DELAY_NOT_APPLICABLE', 409, { status: order.status });
    }

    if (order.promisedAt) {
      await tx.supplyOrder.update({
        where: { id: order.id },
        data: { promisedAt: new Date(order.promisedAt.getTime() + delayMinutes * 60_000) },
      });
    }

    await recordEvent(tx, order.id, {
      type: 'DELAY',
      delayMinutes,
      reasonCode,
      note: note ?? null,
      actorMembershipId: membershipId ?? null,
    });

    return getOrder(businessId, order.id, tx);
  });

  // Requirement 9's whole point: the branch finds out without ringing anyone.
  await triggers.orderDelayed(businessId, delayed, delayMinutes, {
    actorMembershipId: membershipId,
  });
  return delayed;
}

/**
 * The warehouse says whether a payment reached it — "Received" or "Not
 * received" in the app (requirement 26).
 *
 * Held by `supplyPayment:verify`: the desk, and the accountant, who is the one
 * reading the bank's notifications (requirement 27). Every payment to the
 * warehouse is PAID ("payment sent") until one of them looks for "₹2,400 ·
 * #214" in their UPI app and answers — the order number travels in the QR's
 * note for exactly this moment, which is what made the typed reference
 * unnecessary.
 *
 * Only meaningful once something has been sent: verifying a COD order that has
 * not arrived is not a thing that can be true, and letting it through would put
 * a VERIFIED on an order nobody has paid for. Never meaningful for a vendor
 * order, whose money did not come to the warehouse, or an `ACCOUNTS` one, which
 * is the business paying itself — there is nobody to confirm either to.
 */
async function verifyPayment(businessId, supplyOrderId, { outcome, note, membershipId }) {
  const verified = await prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
    if (order.vendorId) throw fail('SUPPLY_ORDER_VENDOR_ORDER', 409);
    if (order.paymentMode === 'ACCOUNTS') throw fail('SUPPLY_ORDER_SETTLED_BY_ACCOUNTS', 409);
    if (order.paymentStatus === 'PENDING') throw fail('SUPPLY_ORDER_PAYMENT_NOT_CLAIMED', 409);

    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: outcome,
        paymentVerifiedAt: outcome === 'VERIFIED' ? new Date() : null,
      },
    });

    await recordEvent(tx, order.id, {
      type: 'PAYMENT',
      reasonCode: outcome === 'VERIFIED' ? 'PAYMENT_VERIFIED' : 'PAYMENT_FAILED',
      note: note ?? null,
      actorMembershipId: membershipId ?? null,
    });

    return getOrder(businessId, order.id, tx);
  });

  // Only the good outcome is announced. A branch does not need a push telling
  // it the reference it typed was wrong before the desk has spoken to them.
  if (outcome === 'VERIFIED') {
    await triggers.paymentVerified(businessId, verified, { actorMembershipId: membershipId });
  }
  return verified;
}

/** Shared by all three listings below. `branchAccess === null` means every one. */
function branchFilter(scope) {
  return scope.branchAccess === null ? {} : { branchId: { in: scope.branchAccess } };
}

/** A branch's own orders, cart included — requirement 11's tracking view. */
/**
 * How many orders any one of these lists will return.
 *
 * Every one of them used to be unbounded. A supply order is never deleted, so
 * "the desk's queue" and "a branch's orders" both meant *every order ever
 * placed* — each with its items and its whole event timeline attached — fetched
 * again on every screen focus. That is fine in the first month and gets slower
 * every week after it, which is the kind of decay nobody reports as a bug
 * because no single day is noticeably worse than the one before.
 *
 * 200 matches the ceiling `listTransactions` already uses. A busy branch places
 * a handful of orders a day, so this is months of history and well past what
 * anybody scrolls; the statuses that represent live work are a few dozen rows
 * at most and are never truncated in practice.
 *
 * Proper pagination is the real answer and is deliberately not attempted here —
 * it changes the response shape, and every one of these is consumed by a screen
 * expecting a plain array.
 */
const MAX_ORDERS = 200;

/**
 * Keep the NEWEST rows, then hand them back in the order the caller asked for.
 *
 * The desk reads its queue oldest-first, which is right for work in progress
 * and exactly wrong to truncate: `take` with an ascending sort keeps the oldest
 * 200 orders in the business and hides everything recent — the screen would
 * have frozen on ancient history. So the *query* always sorts newest-first and
 * the ascending case is reversed afterwards.
 *
 * Below the cap this returns precisely what it returned before, in the same
 * order. Above it, the rows that fall off are the oldest, which is the only
 * defensible end to lose.
 */
function newestFirst(orderBy) {
  return orderBy.map((clause) => {
    const [field] = Object.keys(clause);
    return { [field]: 'desc' };
  });
}

async function takeNewest(where, orderBy, { ascending, include = ORDER_INCLUDE }) {
  const rows = await prisma.supplyOrder.findMany({
    where,
    include,
    orderBy: ascending ? newestFirst(orderBy) : orderBy,
    take: MAX_ORDERS,
  });
  return ascending ? rows.reverse() : rows;
}

async function listBranchOrders(businessId, scope, { branchId, status } = {}) {
  return takeNewest(
    {
      businessId,
      ...branchFilter(scope),
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
    },
    [{ placedAt: 'desc' }, { createdAt: 'desc' }],
    { ascending: false }
  );
}

/**
 * The central desk — requirement 3: "one person can see all the branches'
 * incoming supply orders".
 *
 * Carts are excluded rather than filtered on the client. A DRAFT is a branch
 * thinking out loud; it is not an order, and showing the desk a list where some
 * rows are not real work is how a queue stops being trusted.
 *
 * So is a franchise branch's VENDOR order, for the same reason: the branch
 * orders from that vendor itself and the desk has nothing to do with it. A
 * company-operated branch's vendor order IS desk work — forwarding it to the
 * vendor. `reachesDesk` is the same rule for a single order.
 */
async function listDeskOrders(businessId, scope, { status, branchId } = {}) {
  return takeNewest(
    {
      businessId,
      ...branchFilter(scope),
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : { status: { not: 'DRAFT' } }),
      OR: [{ vendorId: null }, { operatingModel: 'FOCO' }],
    },
    [{ placedAt: 'asc' }],
    // Oldest-first is the queue order the desk works in, and is exactly the
    // case that must not be truncated from the front. See `takeNewest`.
    { ascending: true }
  );
}

/**
 * A delivery agent's run — requirement 12.
 *
 * Their own assigned orders, plus anything dispatched to a branch they cover
 * that nobody has been named on. Without that second arm, a desk that dispatches
 * without assigning produces orders no agent can see and no agent can close.
 */
async function listDeliveryOrders(businessId, scope, { includeDelivered = false } = {}) {
  const live = includeDelivered ? ['DISPATCHED', 'DELIVERED'] : ['DISPATCHED'];
  return takeNewest(
    {
      businessId,
      status: { in: live },
      OR: [
        { deliveryAgentMembershipId: scope.membershipId },
        { deliveryAgentMembershipId: null, ...branchFilter(scope) },
      ],
    },
    [{ dispatchedAt: 'asc' }],
    // What is still on the road is a short list; `includeDelivered` is what
    // turns this into an ever-growing one, and it is the same truncation.
    { ascending: true }
  );
}

// --- Accounts (requirement 27) -------------------------------------------------

/**
 * What accounts has to pay for: every company-operated branch's order that is
 * still unpaid, delivered or not.
 *
 * Not-yet-delivered orders are included on purpose. Vatsal's rule is that the
 * accountant SEES an order as soon as it is placed and PAYS for it once it has
 * arrived — the app shows the first kind as "on the way" and lets only the
 * second be selected. `settlePayments` holds the line on the server.
 */
async function listPaymentsDue(businessId, scope) {
  return takeNewest(
    {
      businessId,
      ...branchFilter(scope),
      paymentMode: 'ACCOUNTS',
      paymentStatus: 'PENDING',
      status: { notIn: ['DRAFT', 'CANCELLED'] },
    },
    [{ placedAt: 'asc' }],
    { ascending: true, include: PAYMENT_LIST_INCLUDE }
  );
}

/**
 * Payments sent to the warehouse that nobody has confirmed yet — the other
 * half of the accountant's Payments screen, and the desk's to-do list too.
 *
 * Warehouse orders only, by the rule in `receiverConfirms`: a vendor payment is
 * final when it is made and never waits here.
 */
async function listPaymentsToConfirm(businessId, scope) {
  return takeNewest(
    {
      businessId,
      ...branchFilter(scope),
      vendorId: null,
      paymentStatus: 'PAID',
    },
    [{ placedAt: 'asc' }],
    { ascending: true, include: PAYMENT_LIST_INCLUDE }
  );
}

/**
 * Accounts pays for some of the company-operated branches' orders, in one go —
 * requirements 24 and 27.
 *
 * One payment, one payee, one QR: the accountant chooses delivered orders that
 * all go to the warehouse, or all to one vendor, scans a single QR for their
 * total (or opens their UPI app on it), and says it is done. Every order in the
 * batch is then VERIFIED, because this is the business paying — there is no
 * outside party in the app to confirm it to (see `receiverConfirms`).
 *
 * ## All or nothing
 *
 * One order in the batch that is not due — already paid, cancelled, a branch's
 * own order, not delivered yet, or to a different payee — refuses the whole
 * batch rather than paying the rest. The total on the QR was the total of all
 * of them, so a partial write would record a payment for a different amount
 * from the one that was actually made.
 *
 * ## Locks
 *
 * The rows are locked in id order before they are checked. Two accountants
 * settling overlapping batches from two phones would otherwise both see the
 * shared orders as unpaid and both pay them; taking the locks in one fixed
 * order is what stops the two from deadlocking while they wait for each other.
 */
async function settlePayments(businessId, scope, { supplyOrderIds, paymentReference, membershipId }) {
  const ids = [...new Set(supplyOrderIds)].sort();
  const reference = paymentReference?.trim() || null;

  const settled = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM supply_orders WHERE id IN (${Prisma.join(ids)}) AND "businessId" = ${businessId} ORDER BY id FOR UPDATE`;

    const orders = await tx.supplyOrder.findMany({
      where: { id: { in: ids }, businessId, ...branchFilter(scope) },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        vendorId: true,
        paymentMode: true,
        paymentStatus: true,
        totalAmount: true,
        currency: true,
      },
    });
    if (orders.length !== ids.length) throw fail('SUPPLY_ORDER_NOT_FOUND', 404);

    for (const order of orders) {
      if (order.paymentMode !== 'ACCOUNTS' || order.paymentStatus !== 'PENDING' || order.status === 'CANCELLED') {
        throw fail('SUPPLY_PAYMENT_NOT_DUE', 409, { orderNumber: order.orderNumber });
      }
      if (order.status !== 'DELIVERED') {
        throw fail('SUPPLY_PAYMENT_NOT_DELIVERED', 409, { orderNumber: order.orderNumber });
      }
    }
    if (new Set(orders.map((order) => order.vendorId ?? 'WAREHOUSE')).size > 1) {
      throw fail('SUPPLY_PAYMENT_MIXED_PAYEES', 409);
    }

    const now = new Date();
    await tx.supplyOrder.updateMany({
      where: { id: { in: ids } },
      data: { paymentStatus: 'VERIFIED', paymentVerifiedAt: now, paymentReference: reference },
    });
    await tx.supplyOrderEvent.createMany({
      data: ids.map((id) => ({
        supplyOrderId: id,
        type: 'PAYMENT',
        reasonCode: 'PAYMENT_SETTLED',
        note: reference,
        actorMembershipId: membershipId ?? null,
        createdAt: now,
      })),
    });

    return {
      count: orders.length,
      totalAmount: orders.reduce((sum, order) => sum.plus(toDecimal(order.totalAmount)), new Prisma.Decimal(0)),
      currency: orders[0].currency,
      supplyOrderIds: ids,
    };
  });

  return settled;
}

module.exports = {
  getOrCreateCart,
  getOrder,
  addItem,
  updateItem,
  placeOrder,
  acceptOrder,
  packOrder,
  dispatchOrder,
  assignOrder,
  listDeliveryAgents,
  deliverOrder,
  receiveOrder,
  recordPayment,
  cancelOrder,
  rejectOrder,
  postDelay,
  verifyPayment,
  listBranchOrders,
  listDeskOrders,
  listDeliveryOrders,
  listPaymentsDue,
  listPaymentsToConfirm,
  settlePayments,
  TRANSITIONS,
  VENDOR_TRANSITIONS,
};
