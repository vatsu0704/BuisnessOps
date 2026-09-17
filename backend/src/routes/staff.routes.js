const express = require('express');
const staffController = require('../controllers/staff.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

scoped.post('/staff', requireRole('OWNER', 'ADMIN', 'MANAGER'), staffController.createStaffMember);
scoped.get('/staff', staffController.listStaffMembers);
scoped.get('/staff/:staffMemberId', staffController.getStaffMember);

router.use('/:businessId', scoped);

module.exports = router;
