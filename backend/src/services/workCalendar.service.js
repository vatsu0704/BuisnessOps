const prisma = require('../config/db');
const { fail } = require('../errors');
const { dateOnly, dateKeyOf, eachDayOfMonth, monthKey, safeZone, weekdayOf } = require('../utils/datetime');

/**
 * The work calendar: which days of a month a branch actually works.
 *
 * Payroll divides by *working* days, not calendar days. Week-offs and holidays
 * are paid by construction — they appear in neither the divisor nor the
 * numerator — so missing one costs nothing, and a person present on every
 * working day earns exactly their salary. That identity is what makes the model
 * explicable to an owner, and it is covered by a test.
 */

/**
 * A branch override wins whole, never merged: an override of [] means this
 * branch genuinely works seven days, which a merge could not express.
 */
function resolveWeeklyOffDays(business, branch) {
  if (branch && branch.weeklyOffOverride) return branch.weeklyOffDays || [];
  return business.weeklyOffDays || [];
}

/**
 * One month of calendar truth for one branch: every day tagged, plus the counts
 * payroll and the payslip need. Read-only — it never writes, so it is safe to
 * call from a preview endpoint.
 */
async function getMonthCalendar(business, branch, month, year) {
  const weeklyOffDays = new Set(resolveWeeklyOffDays(business, branch));
  const keys = eachDayOfMonth(month, year);
  const start = dateOnly(keys[0]);
  const end = dateOnly(keys[keys.length - 1]);

  const rows = await prisma.holiday.findMany({
    where: {
      businessId: business.id,
      date: { gte: start, lte: end },
      OR: [{ branchId: null }, { branchId: branch.id }],
    },
  });

  // Dedupe by date, with a branch-specific row beating a business-wide one.
  // This is also what makes the NULL-distinct gap in the unique index harmless
  // to the arithmetic: a duplicate business-wide row collapses to one entry.
  const holidays = new Map();
  for (const row of rows) {
    const key = dateKeyOf(row.date);
    if (!holidays.has(key) || row.branchId) holidays.set(key, row);
  }

  const days = keys.map((key) => {
    const isWeeklyOff = weeklyOffDays.has(weekdayOf(key));
    const holiday = holidays.get(key) || null;
    // A holiday is a non-working day whether or not it is paid; isPaid only
    // decides how the payslip labels it.
    return { key, weekday: weekdayOf(key), isWeeklyOff, holiday, isWorkingDay: !isWeeklyOff && !holiday };
  });

  return {
    monthYear: monthKey(month, year),
    timeZone: safeZone(branch.timezone, business.timezone),
    weeklyOffDays: [...weeklyOffDays],
    days,
    workingDays: days.filter((d) => d.isWorkingDay).length,
    weeklyOffCount: days.filter((d) => d.isWeeklyOff).length,
    holidayCount: days.filter((d) => d.holiday).length,
    holidays: days
      .filter((d) => d.holiday)
      .map((d) => ({ date: d.key, name: d.holiday.name, isPaid: d.holiday.isPaid })),
  };
}

async function getWorkWeek(businessId) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { weeklyOffDays: true, unmarkedWorkingDayStatus: true },
  });
  const branches = await prisma.branch.findMany({
    where: { businessId },
    select: { id: true, name: true, code: true, timezone: true, weeklyOffOverride: true, weeklyOffDays: true },
    orderBy: { name: 'asc' },
  });
  return { ...business, branches };
}

function updateWorkWeek(businessId, { weeklyOffDays, unmarkedWorkingDayStatus }) {
  const data = {};
  if (weeklyOffDays !== undefined) data.weeklyOffDays = weeklyOffDays;
  if (unmarkedWorkingDayStatus !== undefined) data.unmarkedWorkingDayStatus = unmarkedWorkingDayStatus;
  return prisma.business.update({
    where: { id: businessId },
    data,
    select: { weeklyOffDays: true, unmarkedWorkingDayStatus: true },
  });
}

function listHolidays(businessId, { year, branchId, accessibleBranchIds }) {
  const where = { businessId };
  if (year) {
    where.date = { gte: dateOnly(`${year}-01-01`), lte: dateOnly(`${year}-12-31`) };
  }
  if (branchId) {
    // A branch's effective calendar is its own rows plus the business-wide ones.
    where.OR = [{ branchId: null }, { branchId }];
  } else if (accessibleBranchIds) {
    // A MANAGER sees business-wide holidays plus those of branches they can reach.
    where.OR = [{ branchId: null }, { branchId: { in: accessibleBranchIds } }];
  }
  return prisma.holiday.findMany({
    where,
    orderBy: { date: 'asc' },
    include: { branch: { select: { id: true, name: true } } },
  });
}

async function createHoliday(businessId, { date, name, branchId = null, isPaid = true }) {
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId }, select: { id: true } });
    if (!branch) {
      throw fail('BRANCH_NOT_FOUND', 404);
    }
  }

  // Postgres treats NULL branchId as distinct, so the unique index cannot stop
  // two business-wide holidays on one date. Check explicitly rather than
  // leaving a duplicate for the admin list to show twice.
  const clash = await prisma.holiday.findFirst({
    where: { businessId, branchId, date: dateOnly(date) },
    select: { id: true },
  });
  if (clash) {
    throw fail('HOLIDAY_DUPLICATE', 409);
  }

  return prisma.holiday.create({
    data: { businessId, branchId, date: dateOnly(date), name, isPaid },
    include: { branch: { select: { id: true, name: true } } },
  });
}

async function deleteHoliday(businessId, holidayId) {
  const holiday = await prisma.holiday.findFirst({ where: { id: holidayId, businessId }, select: { id: true } });
  if (!holiday) {
    throw fail('HOLIDAY_NOT_FOUND', 404);
  }
  await prisma.holiday.delete({ where: { id: holidayId } });
  return { id: holidayId };
}

module.exports = {
  resolveWeeklyOffDays,
  getMonthCalendar,
  getWorkWeek,
  updateWorkWeek,
  listHolidays,
  createHoliday,
  deleteHoliday,
};
