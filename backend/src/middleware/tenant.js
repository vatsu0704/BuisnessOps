const prisma = require('../config/db');
const { fail } = require('../errors');

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

    // OWNER/ADMIN have implicit access to every branch in the business.
    // MANAGER/STAFF are limited to whatever BranchAccess rows exist for them.
    const hasFullAccess = membership.role === 'OWNER' || membership.role === 'ADMIN';
    req.branchAccess = hasFullAccess ? null : membership.branchAccess.map((ba) => ba.branchId);

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resolveTenant };
