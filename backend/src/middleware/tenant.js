const prisma = require('../config/db');
const { fail } = require('../errors');
const { roleHas } = require('../permissions');

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

    const membership = await prisma.membership.findUnique({
      where: { userId_businessId: { userId: req.userId, businessId } },
      include: { branchAccess: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return next(fail('TENANT_ACCESS_DENIED', 403));
    }

    req.tenant = {
      businessId,
      membershipId: membership.id,
      role: membership.role,
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
    req.branchAccess = roleHas(membership.role, 'branch:allAccess')
      ? null
      : membership.branchAccess.map((ba) => ba.branchId);

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveTenant };
