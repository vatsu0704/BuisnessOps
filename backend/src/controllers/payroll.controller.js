const payrollService = require('../services/payroll.service');
const { fail, validationFailure } = require('../errors');
const staffService = require('../services/staff.service');
const attendanceService = require('../services/attendance.service');
const prisma = require('../config/db');
const { canViewStaffMember, canViewPayroll, scopeOf } = require('../middleware/staffScope');
const { validateGeneratePayroll, validatePayrollRun } = require('../validations/payroll.validation');
const { validateMonthYearQuery } = require('../validations/attendance.validation');
const { renderPayslipHtml } = require('../documents/payslip.template');
const { SUPPORTED: SUPPORTED_LANGS } = require('../documents/payslip.labels');

// Business.defaultLocale is the Postgres enum (EN/HI/GU/MR); the document
// templates are keyed by the i18n language code the app uses.
const LOCALE_TO_LANG = { EN: 'en', HI: 'hi', GU: 'gu', MR: 'mr' };

async function generateSalarySlip(req, res, next) {
  try {
    const errors = validateGeneratePayroll(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) throw fail('STAFF_NOT_FOUND', 404);

    const slip = await payrollService.generateSalarySlip(req.tenant.businessId, staffMember, {
      month: Number(req.body.month),
      year: Number(req.body.year),
      // Deliberately NOT defaulted to 0. An omitted deductions means "leave it
      // as it was"; defaulting here is what used to wipe a stored deduction
      // every time a slip was regenerated.
      deductions: req.body.deductions,
      deductionNote: req.body.deductionNote,
    });
    res.status(201).json(slip);
  } catch (err) {
    next(err);
  }
}

async function listSalarySlips(req, res, next) {
  try {
    const slips = await payrollService.listSalarySlips(req.tenant.businessId, {
      monthYear: req.query.monthYear,
      branchId: req.query.branchId,
      accessibleBranchIds: req.branchAccess,
    });
    res.json(slips);
  } catch (err) {
    next(err);
  }
}

async function listStaffSalarySlips(req, res, next) {
  try {
    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) throw fail('STAFF_NOT_FOUND', 404);

    // Your own payslips, or a manager/owner who can see this person at all.
    const scope = scopeOf(req);
    const isSelf = staffMember.userId && staffMember.userId === req.userId;
    if (!isSelf && !(canViewPayroll(scope) && canViewStaffMember(scope, staffMember))) {
      throw fail('STAFF_ACCESS_DENIED', 403);
    }

    const slips = await payrollService.listSalarySlipsForStaff(req.tenant.businessId, staffMember.id);
    res.json(slips);
  } catch (err) {
    next(err);
  }
}

async function finalizeSalarySlip(req, res, next) {
  try {
    const slip = await payrollService.finalizeSalarySlip(req.tenant.businessId, req.params.slipId);
    res.json(slip);
  } catch (err) {
    next(err);
  }
}

async function previewPayrollRun(req, res, next) {
  try {
    const errors = validatePayrollRun(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const result = await payrollService.runPayroll(req.tenant.businessId, {
      month: Number(req.query.month),
      year: Number(req.query.year),
      branchId: req.query.branchId,
      dryRun: true,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function runPayroll(req, res, next) {
  try {
    const errors = validatePayrollRun(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const result = await payrollService.runPayroll(req.tenant.businessId, {
      month: Number(req.body.month),
      year: Number(req.body.year),
      branchId: req.body.branchId,
      staffMemberIds: req.body.staffMemberIds,
      deductionsByStaffId: req.body.deductionsByStaffId || {},
      dryRun: false,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** A staff member's month, in the same shape the payslip is computed from. */
async function getStaffMonthSummary(req, res, next) {
  try {
    const errors = validateMonthYearQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) throw fail('STAFF_NOT_FOUND', 404);
    if (!canViewStaffMember(scopeOf(req), staffMember)) {
      throw fail('STAFF_ACCESS_DENIED', 403);
    }

    const branch = await attendanceService.branchOf(req.tenant.businessId, staffMember);
    const business = await prisma.business.findUnique({ where: { id: req.tenant.businessId } });
    const summary = await payrollService.summariseMonth(
      business,
      branch,
      staffMember,
      Number(req.query.month),
      Number(req.query.year)
    );
    // The full day-by-day calendar is large and the summary screens don't use
    // it; the holiday list they do use is already lifted out.
    res.json({ ...summary, calendar: undefined, holidays: summary.calendar.holidays });
  } catch (err) {
    next(err);
  }
}

/**
 * The payslip as a styled HTML document, which the client turns into a PDF with
 * the device's own print engine (expo-print) or the browser's print dialog.
 *
 * Replaces the pdfmake PDF route: pdfmake was configured with base-14
 * Helvetica and embedded no font, so it could not render `₹` or any Indic
 * script — in an app that ships in English, Hindi, Gujarati and Marathi. A
 * WebView uses the device's own fonts and has no such limit.
 */
async function getSalarySlipDocument(req, res, next) {
  try {
    const slip = await payrollService.getSalarySlip(req.tenant.businessId, req.params.slipId);
    if (!slip) throw fail('SALARY_SLIP_NOT_FOUND', 404);

    const scope = scopeOf(req);
    const isSelf = slip.staffMember.userId && slip.staffMember.userId === req.userId;
    // MANAGER can now be allowed through, because the slip carries branchId.
    const isManager = canViewPayroll(scope) && canViewStaffMember(scope, slip.staffMember);
    if (!isSelf && !isManager) {
      throw fail('SALARY_SLIP_ACCESS_DENIED', 403);
    }

    const requested = String(req.query.lang || '').toLowerCase();
    const lang = SUPPORTED_LANGS.includes(requested) ? requested : LOCALE_TO_LANG[slip.business.defaultLocale] || 'en';

    const document = renderPayslipHtml({
      business: slip.business,
      branch: slip.branch,
      staffMember: slip.staffMember,
      slip,
      lang,
    });

    // The document has no scripts and no remote assets, so lock it down to
    // match. helmet() is already global; this tightens the one route that
    // returns markup rather than JSON.
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(document);
  } catch (err) {
    next(err);
  }
}

/**
 * DEPRECATED — superseded by getSalarySlipDocument. Kept so that an app build
 * already on someone's phone keeps working against a freshly deployed backend;
 * it goes with the pdfmake dependency once the app ships the HTML payslip.
 */
async function getSalarySlipPdf(req, res, next) {
  try {
    const slip = await payrollService.getSalarySlip(req.tenant.businessId, req.params.slipId);
    if (!slip) throw fail('SALARY_SLIP_NOT_FOUND', 404);

    const scope = scopeOf(req);
    const isSelf = slip.staffMember.userId && slip.staffMember.userId === req.userId;
    if (!isSelf && !(canViewPayroll(scope) && canViewStaffMember(scope, slip.staffMember))) {
      throw fail('SALARY_SLIP_ACCESS_DENIED', 403);
    }

    const pdfBuffer = await payrollService.generateSalarySlipPdf(slip);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="salary-slip-${slip.monthYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generateSalarySlip,
  listSalarySlips,
  listStaffSalarySlips,
  finalizeSalarySlip,
  previewPayrollRun,
  runPayroll,
  getStaffMonthSummary,
  getSalarySlipDocument,
  getSalarySlipPdf,
};
