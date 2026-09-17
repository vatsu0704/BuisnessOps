const payrollService = require('../services/payroll.service');
const staffService = require('../services/staff.service');
const { validateGeneratePayroll } = require('../validations/attendance.validation');

async function generateSalarySlip(req, res, next) {
  try {
    const errors = validateGeneratePayroll(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });

    const slip = await payrollService.generateSalarySlip(req.tenant.businessId, staffMember, {
      month: Number(req.body.month),
      year: Number(req.body.year),
      deductions: req.body.deductions ?? 0,
    });
    res.status(201).json(slip);
  } catch (err) {
    next(err);
  }
}

async function listSalarySlips(req, res, next) {
  try {
    const slips = await payrollService.listSalarySlips(req.tenant.businessId, { monthYear: req.query.monthYear });
    res.json(slips);
  } catch (err) {
    next(err);
  }
}

async function listStaffSalarySlips(req, res, next) {
  try {
    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });

    const isSelf = staffMember.userId === req.userId;
    const isOwnerOrAdmin = req.tenant.role === 'OWNER' || req.tenant.role === 'ADMIN';
    if (!isSelf && !isOwnerOrAdmin) {
      return res.status(403).json({ message: 'You do not have access to this staff member' });
    }

    const slips = await payrollService.listSalarySlipsForStaff(req.tenant.businessId, staffMember.id);
    res.json(slips);
  } catch (err) {
    next(err);
  }
}

async function getSalarySlipPdf(req, res, next) {
  try {
    const slip = await payrollService.getSalarySlip(req.tenant.businessId, req.params.slipId);
    if (!slip) return res.status(404).json({ message: 'Salary slip not found' });

    const isSelf = slip.staffMember.userId === req.userId;
    const isOwnerOrAdmin = req.tenant.role === 'OWNER' || req.tenant.role === 'ADMIN';
    if (!isSelf && !isOwnerOrAdmin) {
      return res.status(403).json({ message: 'You do not have access to this salary slip' });
    }

    const pdfBuffer = await payrollService.generateSalarySlipPdf(slip);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="salary-slip-${slip.monthYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

module.exports = { generateSalarySlip, listSalarySlips, listStaffSalarySlips, getSalarySlipPdf };
