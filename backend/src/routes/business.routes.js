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

router.use('/:businessId', scoped);

module.exports = router;
