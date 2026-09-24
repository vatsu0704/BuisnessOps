const express = require('express');
const businessController = require('../controllers/business.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');
const { requireBranchAccess } = require('../middleware/branchScope');

const router = express.Router();

// Everything under /:businessId requires a verified membership in that
// business first (requireAuth resolves *who*, resolveTenant resolves
// *which business, with what role/branch scope*).
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// ---------------------------------------------------------------------------
// The next two routes are DELIBERATELY UNGUARDED and must stay that way.
//
// Every member, down to STAFF, has to be able to read the business they are
// acting under and list the branches they can reach, because that is what
// authStore.switchBusiness() calls to repopulate the session. Adding a
// requirePermission here — which looks like tidying, since every neighbouring
// line has one — locks every non-admin into whichever business they happened to
// be in, and the failure shows up as "the switcher does nothing", far from the
// line that caused it.
//
// listBranches is already scoped by req.branchAccess inside the controller, so
// a branch-scoped role sees only its own branches rather than everything.
// ---------------------------------------------------------------------------
scoped.get('/', businessController.getBusiness);

scoped.post('/branches', requirePermission('branch:create'), businessController.createBranch);
scoped.get('/branches', businessController.listBranches);
scoped.patch('/branches/:branchId', requirePermission('branch:update'), businessController.updateBranch);
scoped.get('/branches/:branchId', requireBranchAccess, businessController.getBranch);
scoped.get('/branches/:branchId/transactions', requireBranchAccess, businessController.listTransactions);
scoped.get('/sales-summary', businessController.getSalesSummary);

scoped.post('/memberships', requirePermission('team:invite'), businessController.createMembership);
scoped.get('/memberships', requirePermission('team:view'), businessController.listMemberships);
scoped.get('/invites', requirePermission('team:view'), businessController.listInvites);
scoped.post(
  '/memberships/:membershipId/branch-access',
  requirePermission('team:manageBranchAccess'),
  businessController.addBranchAccess
);

// Taking access away. Granting it was the only direction that existed:
// an invite could be sent but never withdrawn, and a branch grant never
// narrowed. Revoking a membership is a POST rather than a DELETE because it
// is a soft status change (the row survives, for the audit trail it carries),
// while a branch grant genuinely is deleted.
scoped.delete('/invites/:inviteId', requirePermission('team:revoke'), businessController.revokeInvite);
scoped.post(
  '/memberships/:membershipId/revoke',
  requirePermission('team:revoke'),
  businessController.revokeMembership
);
scoped.delete(
  '/memberships/:membershipId/branch-access/:branchId',
  requirePermission('team:manageBranchAccess'),
  businessController.removeBranchAccess
);

router.use('/:businessId', scoped);

module.exports = router;
