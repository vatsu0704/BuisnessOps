const prisma = require('../config/db');

// businessId arrives as a route param, but it is never trusted on its own:
// this middleware always re-verifies it against a real, ACTIVE Membership
// row for req.userId before attaching req.tenant. A caller who passes a
// businessId they don't belong to — guessed or otherwise — is rejected here,
// regardless of what the request claims.
async function resolveTenant(req, res, next) {
  try {
    const { businessId } = req.params;
    if (!businessId) {
      return res.status(400).json({ message: 'businessId is required in the route' });
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_businessId: { userId: req.userId, businessId } },
      include: { branchAccess: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return res.status(403).json({ message: 'You do not have access to this business' });
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
