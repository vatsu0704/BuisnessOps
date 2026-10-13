const prisma = require('../config/db');
const { fail } = require('../errors');
const { readOperator } = require('../legal/operator');
const { accessState, DAY_MS } = require('../billing/access');
const {
  PLANS,
  PLAN_CAPABILITIES,
  PLAN_FEATURES,
  PLAN_ROLES,
  TRIAL_PLAN,
  TRIAL_DAYS,
} = require('../permissions/plans');

/**
 * Requirement 28 — a business's plan, its trial, and its branch limit.
 *
 * What the plan UNLOCKS is decided in permissions/plans.js and enforced by
 * requirePermission and billing/guards.js. This file owns the Subscription row:
 * creating it with the business, the branch count it pays for, and what the
 * owner is shown. Paid plans are set by scripts/set-plan.js until a payment
 * gateway exists, and that script writes through `setPlan` below so the rules
 * are the same whichever door a change comes through.
 */

// Which branches are billed: the ones that sell. A warehouse has no till and is
// free; an INACTIVE or CLOSED branch has stopped trading and is not charged for.
const BILLED_BRANCH = { kind: 'BRANCH', status: 'ACTIVE' };

function countBilledBranches(businessId, client = prisma) {
  return client.branch.count({ where: { businessId, ...BILLED_BRANCH } });
}

/**
 * Every new business starts a trial of the top plan, in the same transaction
 * that creates it — called from business.service's createBusinessForUser, the
 * one function both signup and a second business go through.
 */
async function startTrial(businessId, client = prisma, now = new Date()) {
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  const subscription = await client.subscription.create({
    data: { businessId, plan: TRIAL_PLAN, status: 'TRIALING', trialEndsAt },
  });
  await client.billingEvent.create({
    data: {
      businessId,
      type: 'TRIAL_STARTED',
      plan: TRIAL_PLAN,
      periodEnd: trialEndsAt,
      actor: 'system',
    },
  });
  return subscription;
}

/**
 * Throws PLAN_BRANCH_LIMIT if one more billed branch would exceed what has been
 * paid for. MUST be called inside the transaction that then writes the branch.
 *
 * The subscription row is locked first (`SELECT … FOR UPDATE`), so two branches
 * created at the same moment cannot both read "two of three in use" and both
 * succeed — the cashierAssignment.service.js pattern, for the same reason.
 * `paidBranchCount` null is the trial, which has no limit.
 */
async function assertRoomForAnotherBranch(tx, businessId) {
  const [locked] = await tx.$queryRaw`
    SELECT "paidBranchCount" FROM subscriptions WHERE "businessId" = ${businessId} FOR UPDATE`;
  if (!locked || locked.paidBranchCount === null) return;

  const inUse = await countBilledBranches(businessId, tx);
  if (inUse >= locked.paidBranchCount) {
    throw fail('PLAN_BRANCH_LIMIT', 409, { paidBranchCount: locked.paidBranchCount });
  }
}

/** Does this branch, as it would be after a write, count towards the bill? */
function isBilled({ kind, status }) {
  return (kind ?? 'BRANCH') === 'BRANCH' && (status ?? 'ACTIVE') === 'ACTIVE';
}

/**
 * Where a subscription stands, in the shape every client reads: on each
 * membership's business (so the app knows its plan without another request),
 * and inside the owner's Plan screen.
 */
function subscriptionView(subscription, now = new Date()) {
  const access = accessState(subscription, now);
  return {
    plan: access.plan,
    status: access.status,
    state: access.state,
    endsAt: access.endsAt,
    graceEndsAt: access.graceEndsAt,
    paidBranchCount: access.paidBranchCount,
  };
}

/**
 * The owner's Plan screen: where the subscription stands, how many billed
 * branches are in use against how many are paid for, and what every plan
 * unlocks. Plan CODES and their contents only — prices are not the app's to
 * state (see the header of permissions/plans.js).
 */
async function getSubscriptionSummary(businessId) {
  const [subscription, billedBranchCount] = await Promise.all([
    prisma.subscription.findUnique({ where: { businessId } }),
    countBilledBranches(businessId),
  ]);

  return {
    ...subscriptionView(subscription),
    interval: subscription?.interval ?? null,
    billedBranchCount,
    // Who to write to about changing the plan, while a plan is changed by hand
    // (stage 1). The same SUPPORT_EMAIL the public legal pages name; null until
    // the company's details are configured.
    contactEmail: readOperator().email,
    plans: PLANS.map((code) => ({
      code,
      capabilities: PLAN_CAPABILITIES[code],
      features: PLAN_FEATURES[code],
      roles: PLAN_ROLES[code],
    })),
  };
}

/**
 * Put a business on a paid plan, or change the one it is on. Used by
 * scripts/set-plan.js today and by the payment gateway's webhook later.
 *
 * Refuses a branch count below the branches already trading: deciding which
 * shop stops taking orders is the owner's call, so they close one first, and
 * nothing here ever has to pick.
 */
async function setPlan(
  businessId,
  { plan, paidBranchCount, interval, periodEnd, amount, currency, reference, note, actor }
) {
  if (!PLANS.includes(plan)) throw new Error(`Unknown plan "${plan}". Expected one of ${PLANS.join(', ')}`);
  if (!Number.isInteger(paidBranchCount) || paidBranchCount < 1) {
    throw new Error('paidBranchCount must be a whole number of at least 1');
  }
  if (interval !== undefined && interval !== null && !['MONTHLY', 'YEARLY'].includes(interval)) {
    throw new Error('interval must be MONTHLY or YEARLY');
  }
  if (!(periodEnd instanceof Date) || Number.isNaN(periodEnd.getTime())) {
    throw new Error('periodEnd must be a valid date');
  }
  if (!actor) throw new Error('actor is required, so the change says who made it');

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({ where: { id: businessId }, select: { id: true } });
    if (!business) throw new Error(`No business with id ${businessId}`);

    // Locked for the same reason as a branch create: a branch added while the
    // count is being lowered must not slip in between the check and the write.
    await tx.$queryRaw`SELECT id FROM subscriptions WHERE "businessId" = ${businessId} FOR UPDATE`;
    const inUse = await countBilledBranches(businessId, tx);
    if (paidBranchCount < inUse) {
      throw new Error(
        `This business has ${inUse} trading branches in use; it cannot be put on a plan for ${paidBranchCount}. ` +
          'Ask the owner to close a branch first, or pay for more.'
      );
    }

    const data = {
      plan,
      status: 'ACTIVE',
      interval: interval ?? null,
      paidBranchCount,
      currentPeriodEnd: periodEnd,
      trialEndsAt: null,
    };
    const subscription = await tx.subscription.upsert({
      where: { businessId },
      update: data,
      create: { businessId, ...data },
    });

    await tx.billingEvent.create({
      data: {
        businessId,
        type: 'PLAN_SET',
        plan,
        paidBranchCount,
        interval: interval ?? null,
        periodEnd,
        amount: amount ?? null,
        currency: currency ?? null,
        reference: reference ?? null,
        note: note ?? null,
        actor,
      },
    });

    return subscription;
  });
}

/**
 * End a subscription now. Cancelling is a decision to stop, so the business goes
 * read-only at once with no grace (see billing/access.js). Its data stays, and
 * can still be read and exported.
 */
async function cancel(businessId, { note, actor }) {
  if (!actor) throw new Error('actor is required, so the change says who made it');
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.update({
      where: { businessId },
      data: { status: 'CANCELLED' },
    });
    await tx.billingEvent.create({
      data: { businessId, type: 'CANCELLED', plan: subscription.plan, note: note ?? null, actor },
    });
    return subscription;
  });
}

module.exports = {
  BILLED_BRANCH,
  countBilledBranches,
  startTrial,
  assertRoomForAnotherBranch,
  isBilled,
  subscriptionView,
  getSubscriptionSummary,
  setPlan,
  cancel,
};
