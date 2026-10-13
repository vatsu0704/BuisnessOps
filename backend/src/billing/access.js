const { GRACE_DAYS } = require('../permissions/plans');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a business's subscription stands at `now` (requirement 28).
 *
 * - FULL: inside the trial or the paid period.
 * - GRACE: the period has ended, and for GRACE_DAYS more nothing changes except
 *   that the owner is told. A payment that fails on a Saturday must not shut a
 *   shop's till on the Saturday.
 * - READ_ONLY: grace is over, or the subscription was cancelled. Everything can
 *   still be read and exported, and nothing is ever deleted; nothing new can be
 *   written.
 *
 * Derived from dates rather than stored, so there is no scheduled job whose
 * failure would leave a lapsed business open or a paid one shut — see the note
 * on SubscriptionStatus in schema.prisma.
 *
 * A business with no subscription row is treated as having no plan on record:
 * Starter, read-only. Every business gets a row when it is created and the
 * migration backfilled the ones that existed, so a missing row is a mistake,
 * and a mistake should not quietly hand out the top plan for free.
 *
 * Pure, so it can be tested without a database and called from the middleware
 * without a second query.
 */
function accessState(subscription, now = new Date()) {
  if (!subscription) {
    return {
      plan: 'STARTER',
      status: null,
      state: 'READ_ONLY',
      endsAt: null,
      graceEndsAt: null,
      paidBranchCount: 0,
    };
  }

  const { plan, status, paidBranchCount } = subscription;
  const endsAt = status === 'TRIALING' ? subscription.trialEndsAt : subscription.currentPeriodEnd;
  const graceEndsAt = endsAt ? new Date(new Date(endsAt).getTime() + GRACE_DAYS * DAY_MS) : null;

  let state;
  if (status === 'CANCELLED') {
    // Cancelling is a decision to stop now, so there is no grace after it. A
    // plan that is simply not renewed runs out at its period end instead, and
    // gets grace like any other.
    state = 'READ_ONLY';
  } else if (!endsAt || now < new Date(endsAt)) {
    // An ACTIVE plan with no end date is open-ended — an invoiced customer whose
    // terms say so.
    state = 'FULL';
  } else if (now < graceEndsAt) {
    state = 'GRACE';
  } else {
    state = 'READ_ONLY';
  }

  return {
    plan,
    status,
    state,
    endsAt: endsAt ? new Date(endsAt) : null,
    graceEndsAt,
    paidBranchCount: paidBranchCount ?? null,
  };
}

/** Can this business write at all? Reads and exports never depend on it. */
function isWritable(access) {
  return access.state !== 'READ_ONLY';
}

module.exports = { accessState, isWritable, DAY_MS };
