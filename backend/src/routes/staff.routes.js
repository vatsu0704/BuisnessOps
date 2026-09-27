const express = require('express');
const staffController = require('../controllers/staff.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

scoped.post('/staff', requirePermission('staff:create'), staffController.createStaffMember);
scoped.get('/staff', staffController.listStaffMembers);

// Must precede '/staff/:staffMemberId', or Express matches 'me' as an id.
scoped.get('/staff/me', staffController.getMyStaffMember);

scoped.get('/staff/:staffMemberId', staffController.getStaffMember);
scoped.patch(
  '/staff/:staffMemberId',
  requirePermission('staff:update'),
  staffController.updateStaffMember
);
// Deactivate rather than delete: attendance and past payslips are records of
// something that happened and must survive.
scoped.post(
  '/staff/:staffMemberId/deactivate',
  requirePermission('staff:update'),
  staffController.deactivateStaffMember
);
scoped.post(
  '/staff/:staffMemberId/reactivate',
  requirePermission('staff:update'),
  staffController.reactivateStaffMember
);

router.use('/:businessId', scoped);

module.exports = router;
