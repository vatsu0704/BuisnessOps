const express = require('express');
const payrollController = require('../controllers/payroll.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// Running payroll and viewing payslips are two capabilities, and a third —
// staff:setPay — covers deciding someone's salary in the first place.
// Requirement 14 is what pulled them apart: a CASHIER sets their own branch's
// salaries without running anyone's payroll.
//
// Viewing one specific slip is additionally open to the staff member it belongs
// to, checked inside the controller rather than here.
scoped.post(
  '/staff/:staffMemberId/salary-slips/generate',
  requirePermission('payroll:run'),
  payrollController.generateSalarySlip
);
scoped.post(
  '/salary-slips/:slipId/finalize',
  requirePermission('payroll:run'),
  payrollController.finalizeSalarySlip
);
scoped.get('/payroll/preview', requirePermission('payroll:run'), payrollController.previewPayrollRun);
scoped.post('/payroll/run', requirePermission('payroll:run'), payrollController.runPayroll);

scoped.get('/salary-slips', requirePermission('payroll:view'), payrollController.listSalarySlips);
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
