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

const ORDER_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
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
      addressLine: true,
      city: true,
      region: true,
      postalCode: true,
      latitude: true,
      longitude: true,
    },
  },
  placedByMembership: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
  deliveryAgentMembership: {
    select: { id: true, role: true, user: { select: { id: true, name: true } } },
  },
};

function toDecimal(value) {
  return new Prisma.Decimal(value);
}

function assertTransition(from, to) {
  if (!TRANSITIONS[from].includes(to)) {
    throw fail('SUPPLY_ORDER_INVALID_TRANSITION', 409, { from, to });
  }
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

  const existing = await prisma.supplyOrder.findFirst({
    where: { businessId, branchId, status: 'DRAFT' },
    include: ORDER_INCLUDE,
  });
  if (existing) return existing;

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  return prisma.supplyOrder.create({
    data: {
      businessId,
      branchId,
      status: 'DRAFT',
      totalAmount: new Prisma.Decimal(0),
      currency: branch.currency || business.defaultCurrency,
      // No `placedByMembershipId`. A draft has not been placed by anyone, and
      // because the cart is shared by the branch, whoever opens it is often not
      // whoever sends it. Stamping the opener here made the order claim it was
      // "placed by Hari" while its own history said Deep placed it — one act,
      // two names. The column means what it says: it is filled in at PLACED.
    },
    include: ORDER_INCLUDE,
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
 * Place the order.
 *
 * Payment is **recorded, not collected** — the decision in
 * Docs/REQUIREMENTS.md. No gateway, no money through this app. ONLINE means the
 * branch paid by some other means and types the reference; the warehouse then
 * confirms it against their own records, which is what `verifyPayment` is for.
 * COD stays PENDING until the goods arrive.
 *
 * The order number is allocated here rather than at cart creation: numbering
 * carts would burn numbers on orders that never happened and leave gaps the
 * warehouse would ask about.
 */
async function placeOrder(businessId, supplyOrderId, { paymentMode, paymentReference, membershipId }) {
  const placed = await prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
    assertTransition(order.status, 'PLACED');

    if (order.items.length === 0) throw fail('SUPPLY_ORDER_EMPTY', 400);
    if (paymentMode === 'ONLINE' && !paymentReference?.trim()) {
      throw fail('SUPPLY_ORDER_REFERENCE_REQUIRED', 400);
    }

    const orderNumber = await allocateOrderNumber(businessId, tx);
    const paymentStatus = paymentMode === 'ONLINE' ? 'PAID' : 'PENDING';

    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        status: 'PLACED',
        orderNumber,
        paymentMode,
        paymentStatus,
        paymentReference: paymentReference?.trim() || null,
        placedAt: new Date(),
        // Whoever pressed Place, not whoever opened the cart. The branch
        // shares one cart, so preferring the existing value attributed the act
        // to a colleague who may have only added a line to it.
        placedByMembershipId: membershipId ?? null,
      },
    });

    await recordEvent(tx, order.id, {
      type: 'STATUS_CHANGE',
      fromStatus: order.status,
      toStatus: 'PLACED',
      actorMembershipId: membershipId ?? null,
    });
    // A separate PAYMENT event, not a field on the one above: the payment story
    // has its own timeline (claimed → verified, or failed) and the warehouse
    // reads it as one.
    await recordEvent(tx, order.id, {
      type: 'PAYMENT',
      reasonCode: paymentMode === 'ONLINE' ? 'PAYMENT_CLAIMED' : 'PAYMENT_ON_DELIVERY',
      note: paymentReference?.trim() || null,
      actorMembershipId: membershipId ?? null,
    });

    return getOrder(businessId, order.id, tx);
  });

  // Requirement 3. Outside the transaction on purpose: a push describing an
  // order that then rolled back would be worse than no push at all.
  await triggers.orderPlaced(businessId, placed, { actorMembershipId: membershipId });
  return placed;
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
    assertTransition(order.status, toStatus);

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
  return updated;
}

/**
 * The warehouse takes the order on, optionally promising a time.
 *
 * `promisedAt` is optional because requirement 9 only asks for relative delays
 * ("+30 minutes, traffic"), which are recorded either way. When a promise HAS
 * been made, every delay pushes it, so the cashier reads one moving time
 * instead of doing the arithmetic themselves.
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
 * Mark it delivered — requirement 12.
 *
 * A COD order becomes PAID at this moment and not before, because that is when
 * the money actually changes hands. An ONLINE one is left exactly as the
 * warehouse's verification left it: delivering something is not evidence that
 * its payment cleared.
 *
 * ## Cash on delivery is confirmed, not assumed (requirement 22)
 *
 * Delivering used to stamp a COD order PAID as a side effect of arriving, which
 * quietly recorded that the branch's cash had reached the warehouse on the
 * strength of the goods reaching the branch. Those are two different events,
 * and only the agent standing at the counter knows whether the second one
 * happened. So the person closing the run has to say so — `cashCollected` —
 * and the refusal is the point: an unpaid order that says PAID is money nobody
 * will go looking for.
 *
 * The flag is required only while there is cash outstanding. An ONLINE order,
 * or a COD one already settled, is delivered with no question asked, because
 * asking one whose answer cannot matter teaches people to tap through it.
 */
async function deliverOrder(businessId, supplyOrderId, { membershipId, scope, cashCollected }) {
  const order = await getOrder(businessId, supplyOrderId);

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
  if (cashOutstanding && cashCollected !== true) {
    throw fail('SUPPLY_ORDER_CASH_NOT_CONFIRMED', 400);
  }

  return advance(businessId, supplyOrderId, 'DELIVERED', {
    membershipId,
    extraData: {
      deliveredAt: new Date(),
      ...(cashOutstanding ? { paymentStatus: 'PAID' } : {}),
    },
    // The money is its own event, beside the delivery rather than inside it.
    // The payment story already has a timeline of its own — claimed, verified,
    // failed — and "the cash was handed over" is the COD entry in it. Without
    // this row, a COD order's history showed it becoming PAID with nothing
    // anywhere saying who took the money.
    events: cashOutstanding
      ? [
          {
            type: 'PAYMENT',
            reasonCode: 'PAYMENT_COLLECTED',
            actorMembershipId: membershipId ?? null,
          },
        ]
      : [],
  });
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
    assertTransition(order.status, 'CANCELLED');

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
 * The warehouse checks an ONLINE reference against its own records.
 *
 * Only meaningful once something has been claimed: verifying a COD order that
 * has not arrived is not a thing that can be true, and letting it through would
 * put a VERIFIED on an order nobody has paid for.
 */
async function verifyPayment(businessId, supplyOrderId, { outcome, note, membershipId }) {
  const verified = await prisma.$transaction(async (tx) => {
    const order = await getOrder(businessId, supplyOrderId, tx);
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
async function listBranchOrders(businessId, scope, { branchId, status } = {}) {
  return prisma.supplyOrder.findMany({
    where: {
      businessId,
      ...branchFilter(scope),
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
    },
    include: ORDER_INCLUDE,
    orderBy: [{ placedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * The central desk — requirement 3: "one person can see all the branches'
 * incoming supply orders".
 *
 * Carts are excluded rather than filtered on the client. A DRAFT is a branch
 * thinking out loud; it is not an order, and showing the desk a list where some
 * rows are not real work is how a queue stops being trusted.
 */
async function listDeskOrders(businessId, scope, { status, branchId } = {}) {
  return prisma.supplyOrder.findMany({
    where: {
      businessId,
      ...branchFilter(scope),
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : { status: { not: 'DRAFT' } }),
    },
    include: ORDER_INCLUDE,
    orderBy: [{ placedAt: 'asc' }],
  });
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
  return prisma.supplyOrder.findMany({
    where: {
      businessId,
      status: { in: live },
      OR: [
        { deliveryAgentMembershipId: scope.membershipId },
        { deliveryAgentMembershipId: null, ...branchFilter(scope) },
      ],
    },
    include: ORDER_INCLUDE,
    orderBy: [{ dispatchedAt: 'asc' }],
  });
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
  cancelOrder,
  rejectOrder,
  postDelay,
  verifyPayment,
  listBranchOrders,
  listDeskOrders,
  listDeliveryOrders,
  TRANSITIONS,
};
