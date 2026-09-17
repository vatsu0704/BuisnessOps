const express = require('express');
const payrollController = require('../controllers/payroll.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// Payroll numbers are OWNER/ADMIN-only to generate; viewing a specific slip
// (list or PDF) is also open to the staff member it belongs to, checked
// inside the controllers.
scoped.post(
  '/staff/:staffMemberId/salary-slips/generate',
  requireRole('OWNER', 'ADMIN'),
  payrollController.generateSalarySlip
);
scoped.get('/salary-slips', requireRole('OWNER', 'ADMIN'), payrollController.listSalarySlips);
scoped.get('/staff/:staffMemberId/salary-slips', payrollController.listStaffSalarySlips);
scoped.get('/salary-slips/:slipId/pdf', payrollController.getSalarySlipPdf);

router.use('/:businessId', scoped);

module.exports = router;
