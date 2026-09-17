const prisma = require('../config/db');
const { distanceMeters } = require('../utils/geo');

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Simplification: "today" is computed from the server's UTC clock, not the
// branch's own timezone, so a punch within ~1hr of UTC midnight could land
// on the branch's previous/next local day. Fine for a first pass; revisit
// with a per-branch timezone cutover if that proves to matter in practice.
function dateOnly(isoDateString) {
  const [year, month, day] = isoDateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function assertWithinGeofence(branch, latitude, longitude) {
  if (!branch.geofenceRadiusMeters || branch.latitude === null || branch.longitude === null) return;

  if (latitude === undefined || longitude === undefined) {
    const err = new Error('This branch requires your location to punch in/out');
    err.status = 400;
    throw err;
  }

  const distance = distanceMeters(Number(branch.latitude), Number(branch.longitude), latitude, longitude);
  if (distance > branch.geofenceRadiusMeters) {
    const err = new Error(
      `You are ${Math.round(distance)}m from the branch, outside the allowed ${branch.geofenceRadiusMeters}m radius`
    );
    err.status = 403;
    throw err;
  }
}

async function punchIn(businessId, staffMember, { latitude, longitude }) {
  const branch = await prisma.branch.findFirst({ where: { id: staffMember.branchId, businessId } });
  assertWithinGeofence(branch, latitude, longitude);

  const date = todayDateOnly();
  const existing = await prisma.attendance.findUnique({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date } },
  });
  if (existing?.punchInAt) {
    const err = new Error('Already punched in today');
    err.status = 409;
    throw err;
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
    update: {
      status: 'PRESENT',
      punchInAt: new Date(),
      punchInLat: latitude,
      punchInLng: longitude,
    },
  });
}

async function punchOut(businessId, staffMember, { latitude, longitude }) {
  const date = todayDateOnly();
  const existing = await prisma.attendance.findUnique({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date } },
  });
  if (!existing?.punchInAt) {
    const err = new Error("You haven't punched in today");
    err.status = 400;
    throw err;
  }
  if (existing.punchOutAt) {
    const err = new Error('Already punched out today');
    err.status = 409;
    throw err;
  }

  const branch = await prisma.branch.findFirst({ where: { id: staffMember.branchId, businessId } });
  assertWithinGeofence(branch, latitude, longitude);

  return prisma.attendance.update({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date } },
    data: { punchOutAt: new Date(), punchOutLat: latitude, punchOutLng: longitude },
  });
}

// Manager/owner override for days with no punch (absence, approved leave) or
// to correct a punched day to HALF_DAY.
function markAttendance(businessId, staffMember, { date, status, notes }) {
  const day = dateOnly(date);
  return prisma.attendance.upsert({
    where: { staffMemberId_date: { staffMemberId: staffMember.id, date: day } },
    create: { businessId, branchId: staffMember.branchId, staffMemberId: staffMember.id, date: day, status, notes },
    update: { status, notes },
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

function getDailyRoster(businessId, branchId, dateString) {
  const day = dateOnly(dateString);
  return prisma.attendance.findMany({
    where: { businessId, branchId, date: day },
    include: { staffMember: { select: { id: true, name: true, role: true } } },
    orderBy: { staffMember: { name: 'asc' } },
  });
}

module.exports = {
  punchIn,
  punchOut,
  markAttendance,
  getMonthlyAttendance,
  getDailyRoster,
  todayDateOnly,
  dateOnly,
};
