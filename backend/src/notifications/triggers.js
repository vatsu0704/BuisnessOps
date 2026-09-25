const prisma = require('../config/db');
const notificationService = require('../services/notification.service');

/**
 * Every place the app decides somebody should be told something.
 *
 * Gathered into one file rather than scattered through the services, because
 * "who gets told when an order is dispatched?" is a question about the product
 * and should be answerable by reading one page. The services call these; they
 * do not reach for `notificationService` themselves.
 *
 * ## Two rules
 *
 * 1. **A trigger never throws into its caller.** Dispatching an order that
 *    could not be announced is still a dispatched order. Every function here is
 *    wrapped by `safely`, which swallows and logs — the notification row has
 *    usually already been written by that point anyway, so the in-app centre
 *    still shows it.
 * 2. **Recipients are capabilities, never roles.** "Tell the warehouse" is
 *    "tell everyone holding `supplyOrder:fulfil`". A role added later that
 *    fulfils orders is notified without anybody editing this file.
 */

/**
 * Run a trigger without letting it break the thing it was announcing.
 *
 * Logged rather than silent: a notification that never fires is invisible by
 * nature, and the only way anyone finds out is a line in the server log.
 */
async function safely(label, run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[notify] ${label} failed: ${err.message}`);
  }
}

/**
 * The account behind a membership.
 *
 * Services carry a `membershipId` because that is what their own rows store, so
 * the translation to "which person is that" happens here rather than being
 * threaded through every service signature as a second identifier.
 */
async function userIdOfMembership(membershipId) {
  if (!membershipId) return null;
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

/** The app account behind a staff member, if they have one. */
async function userForStaffMember(staffMemberId) {
  const staff = await prisma.staffMember.findUnique({
    where: { id: staffMemberId },
    select: { userId: true, branchId: true, branch: { select: { name: true } } },
  });
  return staff ?? null;
}

const ATTENDANCE_CODES = {
  PRESENT: 'ATTENDANCE_MARKED_PRESENT',
  ABSENT: 'ATTENDANCE_MARKED_ABSENT',
  HALF_DAY: 'ATTENDANCE_MARKED_HALF_DAY',
  LEAVE: 'ATTENDANCE_MARKED_LEAVE',
};

/**
 * Requirement 2 — "send text from mobile number to worker for present and
 * absent", confirmed as a push rather than an SMS.
 *
 * A worker with no app account is simply not told, and marking still succeeds:
 * the requirement says so, and a staff record does not imply a login.
 */
function attendanceMarked(businessId, { staffMemberId, status, date }) {
  return safely('attendanceMarked', async () => {
    const code = ATTENDANCE_CODES[status];
    if (!code) return;

    const staff = await userForStaffMember(staffMemberId);
    if (!staff?.userId) return;

    await notificationService.notifyUser({
      businessId,
      userId: staff.userId,
      branchId: staff.branchId,
      code,
      // `date` travels as the plain key. Formatting it belongs to whoever
      // renders the sentence, because a date reads differently per language and
      // this process does not know which one.
      params: { date, branch: staff.branch?.name ?? '' },
      deepLink: { route: 'Attendance' },
    });
  });
}

// --- Supply orders ---------------------------------------------------------

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/**
 * A money figure for a notification body.
 *
 * Deliberately simple and deliberately here: this is the one channel where the
 * backend renders text at all, and it is not worth a second formatting system.
 * The app's own `formatAmount` does Indian 2-2-3 grouping for the screens.
 */
function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency ?? ''} `;
  const rounded = Math.round(Number(amount ?? 0));
  return `${symbol}${rounded.toLocaleString('en-IN')}`;
}

function orderParams(order) {
  return {
    orderNumber: order.orderNumber,
    branch: order.branch?.name ?? '',
  };
}

const orderLink = (order) => ({ route: 'SupplyOrderDetail', params: { supplyOrderId: order.id } });

/**
 * Requirement 3 — a branch places an order and the desk finds out without
 * watching the screen.
 */
function orderPlaced(businessId, order, { actorMembershipId } = {}) {
  return safely('orderPlaced', async () => {
    const actorUserId = await userIdOfMembership(actorMembershipId);

    await notificationService.notifyCapability(
      businessId,
      'supplyOrder:fulfil',
      {
        code: 'SUPPLY_ORDER_PLACED',
        params: {
          ...orderParams(order),
          // Pre-formatted rather than sent as a number with a currency beside
          // it: the desk reads this on a lock screen, and "₹1,240" is what
          // they need. The app's own list re-renders from the same string.
          amount: formatMoney(order.totalAmount, order.currency),
          payment: order.paymentMode ?? '',
        },
        deepLink: orderLink(order),
      },
      // Whoever pressed Place does not need telling they pressed it — and an
      // owner who both orders and fulfils would otherwise notify themselves.
      { exceptUserId: actorUserId }
    );
  });
}

const STATUS_CODES = {
  ACCEPTED: 'SUPPLY_ORDER_ACCEPTED',
  PACKED: 'SUPPLY_ORDER_PACKED',
  DISPATCHED: 'SUPPLY_ORDER_DISPATCHED',
  DELIVERED: 'SUPPLY_ORDER_DELIVERED',
  REJECTED: 'SUPPLY_ORDER_REJECTED',
};

/**
 * Requirement 11 — the cashier sees where their order has got to.
 *
 * Addressed to whoever placed it rather than broadcast to the branch: they are
 * the person waiting for it, and the order carries their membership already.
 */
function orderStatusChanged(businessId, order, status, { actorMembershipId } = {}) {
  return safely('orderStatusChanged', async () => {
    const code = STATUS_CODES[status];
    if (!code) return;

    const placedBy = await userIdOfMembership(order.placedByMembershipId);
    const actorUserId = await userIdOfMembership(actorMembershipId);
    if (!placedBy || placedBy === actorUserId) return;

    await notificationService.notifyUser({
      businessId,
      userId: placedBy,
      branchId: order.branchId,
      code,
      params: orderParams(order),
      deepLink: orderLink(order),
    });
  });
}

/**
 * Requirement 9 — "+30 minutes, stock not in", from either end of the run.
 *
 * Goes to the branch that is waiting, which is the whole point of the
 * requirement: it exists so nobody has to ring the warehouse to ask.
 */
function orderDelayed(businessId, order, minutes, { actorMembershipId } = {}) {
  return safely('orderDelayed', async () => {
    const placedBy = await userIdOfMembership(order.placedByMembershipId);
    const actorUserId = await userIdOfMembership(actorMembershipId);
    if (!placedBy || placedBy === actorUserId) return;

    await notificationService.notifyUser({
      businessId,
      userId: placedBy,
      branchId: order.branchId,
      code: 'SUPPLY_ORDER_DELAYED',
      params: { ...orderParams(order), minutes },
      deepLink: orderLink(order),
    });
  });
}

/** Requirement 9's other half — the warehouse has checked the payment. */
function paymentVerified(businessId, order, { actorMembershipId } = {}) {
  return safely('paymentVerified', async () => {
    const placedBy = await userIdOfMembership(order.placedByMembershipId);
    const actorUserId = await userIdOfMembership(actorMembershipId);
    if (!placedBy || placedBy === actorUserId) return;

    await notificationService.notifyUser({
      businessId,
      userId: placedBy,
      branchId: order.branchId,
      code: 'SUPPLY_PAYMENT_VERIFIED',
      params: orderParams(order),
      deepLink: orderLink(order),
    });
  });
}

/**
 * Requirement 21 — the agent is told they have been given a run.
 *
 * This was the gap the testing guide called out by name: dispatch names
 * somebody and the run appears in their queue, but nothing told them, so they
 * had to open the app to find out.
 */
function orderAssigned(businessId, order, agentMembershipId, { actorMembershipId } = {}) {
  return safely('orderAssigned', async () => {
    if (!agentMembershipId) return;
    const agentUserId = await userIdOfMembership(agentMembershipId);
    const actorUserId = await userIdOfMembership(actorMembershipId);
    if (!agentUserId || agentUserId === actorUserId) return;

    await notificationService.notifyUser({
      businessId,
      userId: agentUserId,
      branchId: order.branchId,
      code: 'SUPPLY_ORDER_ASSIGNED',
      params: orderParams(order),
      deepLink: orderLink(order),
    });
  });
}

module.exports = {
  attendanceMarked,
  orderPlaced,
  orderStatusChanged,
  orderDelayed,
  paymentVerified,
  orderAssigned,
};
