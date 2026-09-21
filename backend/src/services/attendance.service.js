const prisma = require('../config/db');
const { fail } = require('../errors');
const { distanceMeters } = require('../utils/geo');
const { dateOnly, dateKeyOf, todayInZone, todayKeyInZone } = require('../utils/datetime');
const workCalendar = require('./workCalendar.service');

// "Today" is the branch's own calendar day, not the server's UTC one. Under the
// old UTC clock an IST punch before 05:30 local was filed against the previous
// day — see utils/datetime.js.
async function branchOf(businessId, staffMember) {
  const branch = await prisma.branch.findFirst({ where: { id: staffMember.branchId, businessId } });
  if (!branch) {
    throw fail('STAFF_HAS_NO_BRANCH', 404);
  }
  return branch;
}

function assertWithinGeofence(branch, latitude, longitude) {
  if (!branch.geofenceRadiusMeters || branch.latitude === null || branch.longitude === null) return;

  if (latitude === undefined || longitude === undefined) {
    throw fail('PUNCH_LOCATION_REQUIRED', 400);
  }

  const distance = distanceMeters(Number(branch.latitude), Number(branch.longitude), latitude, longitude);
  if (distance > branch.geofenceRadiusMeters) {
    // The two numbers travel as params rather than baked into a sentence:
    // this is the one geofence message a person reads while standing outside
    // the shop, so it has to render in their language, with their numbers.
    throw fail('PUNCH_OUTSIDE_GEOFENCE', 403, {
      distance: Math.round(distance),
      radius: branch.geofenceRadiusMeters,
    });
  }
}

async function punchIn(businessId, staffMember, { latitude, longitude }) {
  const branch = await branchOf(businessId, staffMember);
  assertWithinGeofence(branch, latitude, longitude);

  const date = todayInZone(branch.timezone);
  const existing = await prisma.attendance.findUnique({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date } },
  });
  if (existing?.punchInAt) {
    throw fail('PUNCH_ALREADY_IN', 409);
  }

  return prisma.attendance.upsert({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date } },
    create: {
      businessId,
      branchId: staffMember.branchId,
      staffMemberId: staffMember.id,
      date,
      status: 'PRESENT',
      punchInAt: new Date(),
      punchInLat: latitude,
      punchInLng: longitude,
    },
    // Re-punching in after a manager pre-marked the day ABSENT/LEAVE flips it
    // back to PRESENT — the employee showing up overrides the earlier mark.
    // A manager-set HALF_DAY is also promoted, so re-mark it after the punch.
    update: {
      status: 'PRESENT',
      punchInAt: new Date(),
      punchInLat: latitude,
      punchInLng: longitude,
      markedByMembershipId: null,
    },
  });
}

async function punchOut(businessId, staffMember, { latitude, longitude }) {
  const branch = await branchOf(businessId, staffMember);
  const date = todayInZone(branch.timezone);

  const existing = await prisma.attendance.findUnique({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date } },
  });
  if (!existing?.punchInAt) {
    throw fail('PUNCH_NOT_IN', 400);
  }
  if (existing.punchOutAt) {
    throw fail('PUNCH_ALREADY_OUT', 409);
  }

  assertWithinGeofence(branch, latitude, longitude);

  return prisma.attendance.update({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date } },
    data: { punchOutAt: new Date(), punchOutLat: latitude, punchOutLng: longitude },
  });
}

// Manager/owner override for days with no punch (absence, approved leave) or
// to correct a punched day to HALF_DAY.
async function markAttendance(businessId, staffMember, { date, status, notes }, markedByMembershipId = null) {
  const branch = await branchOf(businessId, staffMember);

  // A day that hasn't happened yet cannot have an attendance status. Without
  // this the UI could write arbitrarily far into the future and skew payroll
  // for a month still in progress.
  if (date > todayKeyInZone(branch.timezone)) {
    throw fail('ATTENDANCE_FUTURE_DATE', 400);
  }
  if (staffMember.hiredOn && date < dateKeyOf(staffMember.hiredOn)) {
    throw fail('ATTENDANCE_BEFORE_HIRED', 400);
  }

  const day = dateOnly(date);
  // Marking someone away has to clear the punch, or the row claims both
  // "absent" and "punched in at 09:02" — and payroll would read the status
  // while the roster showed the timestamps.
  const isAway = status === 'ABSENT' || status === 'LEAVE';
  const clearPunch = isAway
    ? {
        punchInAt: null,
        punchInLat: null,
        punchInLng: null,
        punchOutAt: null,
        punchOutLat: null,
        punchOutLng: null,
      }
    : {};

  return prisma.attendance.upsert({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date: day } },
    create: {
      businessId,
      branchId: staffMember.branchId,
      staffMemberId: staffMember.id,
      date: day,
      status,
      notes,
      markedByMembershipId,
    },
    update: { status, notes, markedByMembershipId, ...clearPunch },
  });
}

function getMonthlyAttendance(businessId, staffMemberId, month, year) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return prisma.attendance.findMany({
    where: { businessId, staffMemberId, date: { gte: start, lt: end } },
    orderBy: { date: 'asc' },
  });
}

/**
 * Every ACTIVE staff member of the branch for that day, with their attendance
 * row or null — a left join done in JS.
 *
 * The previous version returned only the Attendance rows that existed, so
 * anyone who hadn't punched was simply absent from the response. That made it
 * impossible to answer "who hasn't punched in yet", which is the one question
 * a roster exists to answer.
 */
async function getDailyRoster(businessId, branch, dateKey) {
  if (dateKey > todayKeyInZone(branch.timezone)) {
    throw fail('ROSTER_FUTURE_DATE', 400);
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const [month, year] = [Number(dateKey.slice(5, 7)), Number(dateKey.slice(0, 4))];
  const calendar = await workCalendar.getMonthCalendar(business, branch, month, year);
  const day = calendar.days.find((d) => d.key === dateKey);

  const [staff, rows] = await Promise.all([
    prisma.staffMember.findMany({
      where: { businessId, branchId: branch.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, userId: true, employeeCode: true, hiredOn: true },
    }),
    prisma.attendance.findMany({ where: { businessId, branchId: branch.id, date: dateOnly(dateKey) } }),
  ]);

  const byStaff = new Map(rows.map((r) => [r.staffMemberId, r]));
  const entries = staff
    // Someone who hadn't joined yet isn't missing from the roster, they're
    // not on it.
    .filter((s) => !s.hiredOn || dateKeyOf(s.hiredOn) <= dateKey)
    .map((s) => ({ staffMember: s, attendance: byStaff.get(s.id) || null }));

  const count = (status) => entries.filter((e) => e.attendance?.status === status).length;

  return {
    date: dateKey,
    isWeeklyOff: !!day?.isWeeklyOff,
    holiday: day?.holiday ? { name: day.holiday.name, isPaid: day.holiday.isPaid } : null,
    isWorkingDay: !!day?.isWorkingDay,
    summary: {
      total: entries.length,
      present: count('PRESENT'),
      absent: count('ABSENT'),
      halfDay: count('HALF_DAY'),
      leave: count('LEAVE'),
      unmarked: entries.filter((e) => !e.attendance).length,
    },
    entries,
  };
}

module.exports = {
  branchOf,
  punchIn,
  punchOut,
  markAttendance,
  getMonthlyAttendance,
  getDailyRoster,
};
