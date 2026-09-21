const express = require('express');
const businessController = require('../controllers/business.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requireRole } = require('../middleware/rbac');
const { requireBranchAccess } = require('../middleware/branchScope');

const router = express.Router();

// Everything under /:businessId requires a verified membership in that
// business first (requireAuth resolves *who*, resolveTenant resolves
// *which business, with what role/branch scope*).
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// The business record itself — every member may read the one they are acting
// under, which is what a business switcher needs to fill the session with.
scoped.get('/', businessController.getBusiness);

scoped.post('/branches', requireRole('OWNER', 'ADMIN'), businessController.createBranch);
scoped.get('/branches', businessController.listBranches);
scoped.patch('/branches/:branchId', requireRole('OWNER', 'ADMIN'), businessController.updateBranch);
scoped.get('/branches/:branchId', requireBranchAccess, businessController.getBranch);
scoped.get('/branches/:branchId/transactions', requireBranchAccess, businessController.listTransactions);
scoped.get('/sales-summary', businessController.getSalesSummary);

scoped.post('/memberships', requireRole('OWNER', 'ADMIN'), businessController.createMembership);
scoped.get('/memberships', requireRole('OWNER', 'ADMIN'), businessController.listMemberships);
scoped.get('/invites', requireRole('OWNER', 'ADMIN'), businessController.listInvites);
scoped.post(
  '/memberships/:membershipId/branch-access',
  requireRole('OWNER', 'ADMIN'),
  businessController.addBranchAccess
);

// Taking access away. Granting it was the only direction that existed:
// an invite could be sent but never withdrawn, and a branch grant never
// narrowed. Revoking a membership is a POST rather than a DELETE because it
// is a soft status change (the row survives, for the audit trail it carries),
// while a branch grant genuinely is deleted.
scoped.delete('/invites/:inviteId', requireRole('OWNER', 'ADMIN'), businessController.revokeInvite);
scoped.post(
  '/memberships/:membershipId/revoke',
  requireRole('OWNER', 'ADMIN'),
  businessController.revokeMembership
);
scoped.delete(
  '/memberships/:membershipId/branch-access/:branchId',
  requireRole('OWNER', 'ADMIN'),
  businessController.removeBranchAccess
);

router.use('/:businessId', scoped);

module.exports = router;
