const prisma = require('../config/db');
const { fail } = require('../errors');
const { roleHas } = require('../permissions');
const { accessState, isWritable } = require('../billing/access');

/**
 * The writes a READ_ONLY business can still make (requirement 28).
 *
 * A lapsed plan stops new business data being written. It must never stop
 * somebody TAKING ACCESS AWAY — an owner whose plan ran out the week a cashier
 * left still has to be able to lock that cashier out — nor stop a person
 * clearing their own notification badge, which is their state rather than the
 * business's.
 *
 * Matched on the path inside the business (`req.path` below `/:businessId`),
 * which is the same for every router mounted there. Fails closed: a write
 * route added later, or one of these whose path changes, is refused while the
 * business is read-only, which is the safe direction to be wrong in.
 */
const READ_ONLY_EXEMPT = [
  ['POST', /^\/memberships\/[^/]+\/revoke\/?$/],
  ['DELETE', /^\/memberships\/[^/]+\/branch-access\/[^/]+\/?$/],
  ['DELETE', /^\/invites\/[^/]+\/?$/],
  ['POST', /^\/notifications\/read-all\/?$/],
  ['POST', /^\/notifications\/[^/]+\/read\/?$/],
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function writeAllowedWhileReadOnly(req) {
  if (SAFE_METHODS.has(req.method)) return true;
  return READ_ONLY_EXEMPT.some(([method, pattern]) => method === req.method && pattern.test(req.path));
}

// businessId arrives as a route param, but it is never trusted on its own:
// this middleware always re-verifies it against a real, ACTIVE Membership
// row for req.userId before attaching req.tenant. A caller who passes a
// businessId they don't belong to — guessed or otherwise — is rejected here,
// regardless of what the request claims.
async function resolveTenant(req, res, next) {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return next(fail('TENANT_BUSINESS_ID_REQUIRED', 400));
    }

    // The business's subscription comes back in the same query as the
    // membership, so requirement 28 costs no extra round trip on a request
    // path every screen hits.
    const membership = await prisma.membership.findUnique({
      where: { userId_businessId: { userId: req.userId, businessId } },
      include: { branchAccess: true, business: { select: { subscription: true } } },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return next(fail('TENANT_ACCESS_DENIED', 403));
    }

    const access = accessState(membership.business.subscription);

    req.tenant = {
      businessId,
      membershipId: membership.id,
      role: membership.role,
      // What the plan unlocks is asked by tenantCan, beside what the role
      // holds — see permissions/index.js.
      plan: access.plan,
      access,
    };

    // `null` means "every branch in this business"; an array is the explicit
    // list from the caller's BranchAccess rows.
    //
    // This is DATA scope, and only data scope. It used to double as
    // "business-wide authority over people" too, because while the set was
    // {OWNER, ADMIN} the two were the same set. WAREHOUSE separates them: the
    // order desk ships to every branch, so it needs this, and has no business
    // reading those branches' HR records, so it must not get that. Authority
    // over people is `staff:viewAllBranches`, asked for separately in
    // middleware/staffScope.js.
    //
    // Deliberately the ROLE alone, not the plan: which branches someone may
    // reach is not something a plan sells.
    req.branchAccess = roleHas(membership.role, 'branch:allAccess')
      ? null
      : membership.branchAccess.map((ba) => ba.branchId);

    // After the tenant is resolved, so a stranger to this business is told it
    // is not theirs rather than that its plan has ended.
    if (!isWritable(access) && !writeAllowedWhileReadOnly(req)) {
      return next(fail('SUBSCRIPTION_READ_ONLY', 402));
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveTenant };
