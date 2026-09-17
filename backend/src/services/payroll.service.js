const prisma = require('../config/db');
const pdfMake = require('pdfmake');
const attendanceService = require('./attendance.service');

// "Helvetica"/"Helvetica-Bold" are PDF base-14 standard fonts that pdfkit
// (pdfmake's renderer) resolves by name — no .ttf file needs to ship with
// the app.
pdfMake.setFonts({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold' } });
// Payslips are built entirely from data already in Postgres — nothing here
// ever needs to fetch a remote URL or read an arbitrary local file.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => true);

const DAYS_WORKED_WEIGHT = { PRESENT: 1, HALF_DAY: 0.5, ABSENT: 0, LEAVE: 0 };

function daysInMonth(month, year) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthYearKey(month, year) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Mirrors the reference formula: (base_salary / working_days_in_month) *
// days_worked, days_worked counting HALF_DAY as 0.5. LEAVE is treated as
// unpaid — there's no leave-balance/policy model yet to say otherwise.
async function calculatePayroll(businessId, staffMember, { month, year, deductions = 0 }) {
  if (staffMember.baseSalary === null || staffMember.baseSalary === undefined) {
    const err = new Error('This staff member has no baseSalary set — cannot generate a payslip');
    err.status = 400;
    throw err;
  }

  const attendance = await attendanceService.getMonthlyAttendance(businessId, staffMember.id, month, year);
  const totalDaysWorked = attendance.reduce((sum, row) => sum + (DAYS_WORKED_WEIGHT[row.status] ?? 0), 0);

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const workingDays = daysInMonth(month, year);
  const grossPay = (Number(staffMember.baseSalary) / workingDays) * totalDaysWorked;
  const netPay = grossPay - deductions;

  return {
    totalDaysWorked,
    grossPay,
    deductions,
    netPay,
    currency: business.defaultCurrency,
    workingDays,
  };
}

async function generateSalarySlip(businessId, staffMember, { month, year, deductions = 0 }) {
  const result = await calculatePayroll(businessId, staffMember, { month, year, deductions });

  return prisma.salarySlip.upsert({
    where: { staffMemberId_monthYear: { staffMemberId: staffMember.id, monthYear: monthYearKey(month, year) } },
    create: {
      businessId,
      staffMemberId: staffMember.id,
      monthYear: monthYearKey(month, year),
      totalDaysWorked: result.totalDaysWorked,
      grossPay: result.grossPay,
      deductions: result.deductions,
      netPay: result.netPay,
      currency: result.currency,
    },
    // Regenerating overwrites the previous draft rather than accumulating
    // duplicate slips for the same staff member/month.
    update: {
      totalDaysWorked: result.totalDaysWorked,
      grossPay: result.grossPay,
      deductions: result.deductions,
      netPay: result.netPay,
      currency: result.currency,
      generatedAt: new Date(),
    },
  });
}

function listSalarySlips(businessId, { monthYear } = {}) {
  const where = { businessId };
  if (monthYear) where.monthYear = monthYear;
  return prisma.salarySlip.findMany({
    where,
    include: { staffMember: { select: { id: true, name: true, role: true } } },
    orderBy: [{ monthYear: 'desc' }, { staffMember: { name: 'asc' } }],
  });
}

function listSalarySlipsForStaff(businessId, staffMemberId) {
  return prisma.salarySlip.findMany({ where: { businessId, staffMemberId }, orderBy: { monthYear: 'desc' } });
}

function getSalarySlip(businessId, slipId) {
  return prisma.salarySlip.findFirst({
    where: { id: slipId, businessId },
    include: { staffMember: true },
  });
}

function formatMoney(amount, currency) {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

// Generated fresh from the stored slip numbers each time, rather than
// persisted to cloud storage (slip_url in the reference doc) — this project
// has no file-storage service wired up yet, and a payslip is cheap to
// regenerate on demand from numbers that are already the source of truth.
async function generateSalarySlipPdf(slip) {
  const business = await prisma.business.findUnique({ where: { id: slip.businessId } });

  const docDefinition = {
    defaultStyle: { font: 'Helvetica' },
    content: [
      { text: business.name, style: 'header' },
      { text: 'Salary Slip', style: 'subheader' },
      { text: `Period: ${slip.monthYear}`, margin: [0, 0, 0, 16] },
      {
        table: {
          widths: ['*', '*'],
          body: [
            ['Employee', slip.staffMember.name],
            ['Role', slip.staffMember.role],
            ['Days worked', String(slip.totalDaysWorked)],
            ['Gross pay', formatMoney(slip.grossPay, slip.currency)],
            ['Deductions', formatMoney(slip.deductions, slip.currency)],
            ['Net pay', formatMoney(slip.netPay, slip.currency)],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: `Generated ${slip.generatedAt.toISOString().slice(0, 10)}`, style: 'footer' },
    ],
    styles: {
      header: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      subheader: { fontSize: 13, margin: [0, 0, 0, 12] },
      footer: { fontSize: 9, color: '#666666', margin: [0, 24, 0, 0] },
    },
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}

module.exports = {
  calculatePayroll,
  generateSalarySlip,
  listSalarySlips,
  listSalarySlipsForStaff,
  getSalarySlip,
  generateSalarySlipPdf,
  monthYearKey,
};
