const prisma = require('../config/db');
const attendanceService = require('./attendance.service');
const workCalendar = require('./workCalendar.service');
const { dec, money, days, atLeastZero, proRate, D } = require('../utils/money');
const { dateKeyOf, monthKey, todayKeyInZone } = require('../utils/datetime');

/**
 * Payroll.
 *
 *   workingDays     = calendar days − week-offs − holidays   (per branch, per month)
 *   totalDaysWorked = daysPresent + 0.5 × daysHalfDay        (working days only)
 *   gross           = baseSalary ÷ workingDays × totalDaysWorked
 *   net             = max(0, gross − deductions)
 *
 * Week-offs and holidays are PAID by construction: they appear in neither the
 * divisor nor the numerator, so missing one costs nothing and someone present
 * on every working day earns exactly their salary. The previous version divided
 * by calendar days, so a person with Sundays off was paid about 87%.
 *
 * All arithmetic is Prisma.Decimal — see utils/money.js. `Number()` is banned
 * in here.
 */

const DAYS_WORKED_WEIGHT = { PRESENT: 1, HALF_DAY: 0.5, ABSENT: 0, LEAVE: 0 };

/**
 * Walks the month's calendar, classifying every day. Shared by the payslip and
 * by the month-summary endpoints, so the numbers on screen and the numbers on
 * the payslip cannot disagree.
 */
async function summariseMonth(business, branch, staffMember, month, year) {
  const calendar = await workCalendar.getMonthCalendar(business, branch, month, year);
  const rows = await attendanceService.getMonthlyAttendance(business.id, staffMember.id, month, year);
  const byDate = new Map(rows.map((r) => [dateKeyOf(r.date), r]));

  const todayKey = todayKeyInZone(calendar.timeZone);
  const hiredKey = staffMember.hiredOn ? dateKeyOf(staffMember.hiredOn) : null;
  const exitedKey = staffMember.exitedOn ? dateKeyOf(staffMember.exitedOn) : null;

  const tally = { present: 0, halfDay: 0, absent: 0, leave: 0, pending: 0, notEmployed: 0 };

  for (const day of calendar.days) {
    // Week-offs and holidays are paid and sit outside the divisor entirely, so
    // a PRESENT row landing on one is ignored — it must not inflate the
    // numerator past workingDays. Overtime is deliberately out of scope.
    if (day.isWeeklyOff || day.holiday) continue;

    // Employment window shrinks the NUMERATOR only; these days stay in
    // workingDays, so a mid-month joiner is paid a part month rather than a
    // full one.
    if (hiredKey && day.key < hiredKey) {
      tally.notEmployed += 1;
      continue;
    }
    if (exitedKey && day.key > exitedKey) {
      tally.notEmployed += 1;
      continue;
    }

    // A working day that hasn't happened yet is pending, not absent — this is
    // what makes a mid-month payslip honest rather than alarming.
    if (day.key > todayKey) {
      tally.pending += 1;
      continue;
    }

    const status = byDate.get(day.key)?.status || business.unmarkedWorkingDayStatus;
    if (status === 'PRESENT') tally.present += 1;
    else if (status === 'HALF_DAY') tally.halfDay += 1;
    else if (status === 'LEAVE') tally.leave += 1;
    else tally.absent += 1;
  }

  const totalDaysWorked = days(
    dec(tally.present).plus(dec(tally.halfDay).mul(dec(DAYS_WORKED_WEIGHT.HALF_DAY)))
  );

  return {
    calendar,
    monthYear: calendar.monthYear,
    workingDays: calendar.workingDays,
    daysPresent: tally.present,
    daysHalfDay: tally.halfDay,
    daysAbsent: tally.absent,
    daysLeave: tally.leave,
    daysPending: tally.pending,
    daysNotEmployed: tally.notEmployed,
    daysWeeklyOff: calendar.weeklyOffCount,
    daysHoliday: calendar.holidayCount,
    totalDaysWorked,
    monthInProgress: tally.pending > 0,
  };
}

async function calculatePayroll(businessId, staffMember, { month, year, deductions, deductionNote }) {
  if (staffMember.baseSalary === null || staffMember.baseSalary === undefined) {
    const err = new Error('This staff member has no baseSalary set — cannot generate a payslip');
    err.status = 400;
    throw err;
  }

  const branch = await attendanceService.branchOf(businessId, staffMember);
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  // A month that hasn't started cannot be paid.
  const todayKey = todayKeyInZone(branch.timezone);
  if (monthKey(month, year) > todayKey.slice(0, 7)) {
    const err = new Error('Cannot generate a payslip for a future month');
    err.status = 400;
    throw err;
  }

  const summary = await summariseMonth(business, branch, staffMember, month, year);
  const grossPay = proRate(staffMember.baseSalary, summary.workingDays, summary.totalDaysWorked);
  const deductionAmount = money(deductions ?? 0);
  // Deductions larger than gross must not produce negative pay. The deduction
  // is still stored at its requested value so the payslip can show it.
  const netPay = atLeastZero(grossPay.minus(deductionAmount));

  return {
    branchId: branch.id,
    baseSalary: money(staffMember.baseSalary),
    workingDays: days(summary.workingDays),
    daysPresent: days(summary.daysPresent),
    daysHalfDay: days(summary.daysHalfDay),
    daysAbsent: days(summary.daysAbsent),
    daysLeave: days(summary.daysLeave),
    daysPending: days(summary.daysPending),
    daysWeeklyOff: days(summary.daysWeeklyOff),
    daysHoliday: days(summary.daysHoliday),
    totalDaysWorked: summary.totalDaysWorked,
    grossPay,
    deductions: deductionAmount,
    deductionNote: deductionNote ?? null,
    netPay,
    currency: business.defaultCurrency,
    calendar: summary.calendar,
    monthInProgress: summary.monthInProgress,
  };
}

async function generateSalarySlip(businessId, staffMember, { month, year, deductions, deductionNote }) {
  const monthYear = monthKey(month, year);

  const existing = await prisma.salarySlip.findUnique({
    where: { staffMemberId_monthYear: { staffMemberId: staffMember.id, monthYear } },
  });

  // A finalized slip is a statement already issued to an employee. Regenerating
  // it would silently restate their pay.
  if (existing?.status === 'FINALIZED') {
    const err = new Error('This payslip is finalized and cannot be regenerated');
    err.status = 409;
    throw err;
  }

  // An omitted `deductions` means "leave it as it was", not "zero it". The
  // controller used to default it to 0 and the upsert wrote that
  // unconditionally, so regenerating a slip silently wiped a deduction someone
  // had entered.
  const effectiveDeductions = deductions ?? existing?.deductions ?? 0;
  const effectiveNote = deductionNote !== undefined ? deductionNote : (existing?.deductionNote ?? null);

  const result = await calculatePayroll(businessId, staffMember, {
    month,
    year,
    deductions: effectiveDeductions,
    deductionNote: effectiveNote,
  });

  const columns = {
    branchId: result.branchId,
    baseSalary: result.baseSalary,
    workingDays: result.workingDays,
    daysPresent: result.daysPresent,
    daysHalfDay: result.daysHalfDay,
    daysAbsent: result.daysAbsent,
    daysLeave: result.daysLeave,
    daysPending: result.daysPending,
    daysWeeklyOff: result.daysWeeklyOff,
    daysHoliday: result.daysHoliday,
    totalDaysWorked: result.totalDaysWorked,
    grossPay: result.grossPay,
    deductions: result.deductions,
    deductionNote: result.deductionNote,
    netPay: result.netPay,
    currency: result.currency,
  };

  return prisma.salarySlip.upsert({
    where: { staffMemberId_monthYear: { staffMemberId: staffMember.id, monthYear } },
    create: { businessId, staffMemberId: staffMember.id, monthYear, ...columns },
    // Regenerating overwrites the previous draft rather than accumulating
    // duplicate slips for the same staff member/month.
    update: { ...columns, generatedAt: new Date() },
  });
}

async function finalizeSalarySlip(businessId, slipId) {
  const slip = await prisma.salarySlip.findFirst({ where: { id: slipId, businessId } });
  if (!slip) {
    const err = new Error('Payslip not found');
    err.status = 404;
    throw err;
  }
  if (slip.status === 'FINALIZED') return slip;
  return prisma.salarySlip.update({
    where: { id: slipId },
    data: { status: 'FINALIZED', finalizedAt: new Date() },
  });
}

/**
 * Generates (or regenerates) every eligible staff member's slip for a month.
 *
 * Sequential, with no wrapping $transaction: an interactive transaction
 * defaults to a 5s timeout and a 50-person run would blow through it. Each
 * upsert is atomic on its own and the whole run is idempotent, so a partial run
 * is recovered by running it again.
 *
 * `dryRun` powers the preview screen, returning the same shape without writing.
 */
async function runPayroll(businessId, { month, year, branchId, staffMemberIds, deductionsByStaffId = {}, dryRun }) {
  const where = { businessId, status: 'ACTIVE' };
  if (branchId) where.branchId = branchId;
  if (staffMemberIds?.length) where.id = { in: staffMemberIds };

  const staff = await prisma.staffMember.findMany({ where, orderBy: { name: 'asc' } });
  const monthYear = monthKey(month, year);

  const slips = [];
  const skipped = [];
  let monthInProgress = false;
  const totals = { grossPay: new D(0), deductions: new D(0), netPay: new D(0) };
  let currency = null;

  for (const staffMember of staff) {
    if (staffMember.baseSalary === null || staffMember.baseSalary === undefined) {
      // Machine codes, not prose: the backend has no i18n, and the client
      // translates these under payrollRun.reason.*.
      skipped.push({ staffMemberId: staffMember.id, name: staffMember.name, reason: 'NO_BASE_SALARY' });
      continue;
    }

    try {
      const deductions = deductionsByStaffId[staffMember.id];
      if (dryRun) {
        const preview = await calculatePayroll(businessId, staffMember, { month, year, deductions });
        monthInProgress = monthInProgress || preview.monthInProgress;
        slips.push({ staffMemberId: staffMember.id, name: staffMember.name, monthYear, ...preview, calendar: undefined });
        totals.grossPay = totals.grossPay.plus(preview.grossPay);
        totals.deductions = totals.deductions.plus(preview.deductions);
        totals.netPay = totals.netPay.plus(preview.netPay);
        currency = currency || preview.currency;
      } else {
        const slip = await generateSalarySlip(businessId, staffMember, { month, year, deductions });
        monthInProgress = monthInProgress || dec(slip.daysPending).greaterThan(0);
        slips.push({ ...slip, name: staffMember.name });
        totals.grossPay = totals.grossPay.plus(dec(slip.grossPay));
        totals.deductions = totals.deductions.plus(dec(slip.deductions));
        totals.netPay = totals.netPay.plus(dec(slip.netPay));
        currency = currency || slip.currency;
      }
    } catch (err) {
      if (err.status === 409) {
        skipped.push({ staffMemberId: staffMember.id, name: staffMember.name, reason: 'ALREADY_FINALIZED' });
      } else if (err.status === 400) {
        skipped.push({ staffMemberId: staffMember.id, name: staffMember.name, reason: 'NO_WORKING_DAYS' });
      } else {
        throw err;
      }
    }
  }

  return {
    monthYear,
    monthInProgress,
    ready: slips.length,
    generated: dryRun ? 0 : slips.length,
    skipped,
    totals: {
      grossPay: money(totals.grossPay).toFixed(2),
      deductions: money(totals.deductions).toFixed(2),
      netPay: money(totals.netPay).toFixed(2),
      currency,
    },
    slips,
  };
}

function listSalarySlips(businessId, { monthYear, branchId, accessibleBranchIds = null } = {}) {
  const where = { businessId };
  if (monthYear) where.monthYear = monthYear;
  if (branchId) where.branchId = branchId;
  // SalarySlip now carries branchId, so a MANAGER can be scoped to their own
  // branches instead of the route being OWNER/ADMIN-only for want of a filter.
  if (accessibleBranchIds !== null) where.branchId = { in: accessibleBranchIds };
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
    include: { staffMember: true, branch: true, business: true },
  });
}

/**
 * DEPRECATED — being replaced by the HTML document in src/documents/.
 *
 * Kept alive only so that no commit in this sequence ships a broken download
 * button: the app in the field still calls GET /salary-slips/:id/pdf. It goes,
 * along with the pdfmake dependency and the route, in the same change that
 * switches the app to the HTML payslip.
 *
 * It cannot render `₹` or any Indic script — pdfmake is configured with base-14
 * Helvetica, which is WinAnsi-only — which is the whole reason for the
 * replacement.
 */
async function generateSalarySlipPdf(slip) {
  const pdfMake = require('pdfmake');
  pdfMake.setFonts({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold' } });
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setLocalAccessPolicy(() => true);

  const business = slip.business || (await prisma.business.findUnique({ where: { id: slip.businessId } }));
  const formatLegacyMoney = (amount, currency) => `${currency} ${dec(amount).toFixed(2)}`;

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
            ['Gross pay', formatLegacyMoney(slip.grossPay, slip.currency)],
            ['Deductions', formatLegacyMoney(slip.deductions, slip.currency)],
            ['Net pay', formatLegacyMoney(slip.netPay, slip.currency)],
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
  summariseMonth,
  calculatePayroll,
  generateSalarySlip,
  finalizeSalarySlip,
  runPayroll,
  listSalarySlips,
  listSalarySlipsForStaff,
  getSalarySlip,
  generateSalarySlipPdf,
};
