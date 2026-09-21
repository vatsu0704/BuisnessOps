const express = require('express');
const payrollController = require('../controllers/payroll.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// Generating pay is OWNER/ADMIN-only — a MANAGER runs attendance, not payroll.
// Listing is open to MANAGER too, scoped to their branches inside the
// controller now that SalarySlip carries branchId. Viewing one specific slip is
// additionally open to the staff member it belongs to.
scoped.post(
  '/staff/:staffMemberId/salary-slips/generate',
  requireRole('OWNER', 'ADMIN'),
  payrollController.generateSalarySlip
);
scoped.post(
  '/salary-slips/:slipId/finalize',
  requireRole('OWNER', 'ADMIN'),
  payrollController.finalizeSalarySlip
);
scoped.get('/payroll/preview', requireRole('OWNER', 'ADMIN'), payrollController.previewPayrollRun);
scoped.post('/payroll/run', requireRole('OWNER', 'ADMIN'), payrollController.runPayroll);

scoped.get('/salary-slips', requireRole('OWNER', 'ADMIN', 'MANAGER'), payrollController.listSalarySlips);
scoped.get('/staff/:staffMemberId/salary-slips', payrollController.listStaffSalarySlips);
scoped.get('/staff/:staffMemberId/attendance/summary', payrollController.getStaffMonthSummary);

// The payslip document. Open to the staff member it belongs to, and to
// OWNER/ADMIN (and a MANAGER for their own branches).
scoped.get('/salary-slips/:slipId/document', payrollController.getSalarySlipDocument);

// DEPRECATED: replaced by /salary-slips/:slipId/document. Kept until the app
// ships the HTML payslip, so a phone running the previous build still works.
scoped.get('/salary-slips/:slipId/pdf', payrollController.getSalarySlipPdf);

router.use('/:businessId', scoped);

module.exports = router;
