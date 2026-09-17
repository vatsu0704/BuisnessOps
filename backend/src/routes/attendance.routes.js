const express = require('express');
const attendanceController = require('../controllers/attendance.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requireRole } = require('../middleware/rbac');
const { requireBranchAccess } = require('../middleware/branchScope');

const router = express.Router();

const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// Self-service — any authenticated member with a linked StaffMember row.
scoped.post('/attendance/punch-in', attendanceController.punchIn);
scoped.post('/attendance/punch-out', attendanceController.punchOut);
scoped.get('/attendance/me', attendanceController.getMyAttendance);

// Manager/owner views and overrides — access to a specific staff member's
// branch is checked inside the controller (self-view is also allowed there).
scoped.get('/staff/:staffMemberId/attendance', attendanceController.getStaffAttendance);
scoped.post(
  '/staff/:staffMemberId/attendance/mark',
  requireRole('OWNER', 'ADMIN', 'MANAGER'),
  attendanceController.markAttendance
);
scoped.get('/branches/:branchId/attendance', requireBranchAccess, attendanceController.getDailyRoster);

router.use('/:businessId', scoped);

module.exports = router;
