const attendanceService = require('../services/attendance.service');
const { fail, validationFailure } = require('../errors');
const staffService = require('../services/staff.service');
const { canViewStaffMember, canMarkAttendanceFor, scopeOf } = require('../middleware/staffScope');
const {
  validatePunch,
  validateMarkAttendance,
  validateMonthYearQuery,
  validateRosterQuery,
} = require('../validations/attendance.validation');

// Every self-service action first resolves "which StaffMember row is me" —
// there is no punching in on someone else's behalf via this path.
async function requireOwnStaffMember(req) {
  const staffMember = await staffService.getStaffMemberByUserId(req.tenant.businessId, req.userId);
  if (!staffMember) throw fail('NOT_A_STAFF_MEMBER', 404);
  return staffMember;
}

async function punchIn(req, res, next) {
  try {
    const errors = validatePunch(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const staffMember = await requireOwnStaffMember(req);

    const attendance = await attendanceService.punchIn(req.tenant.businessId, staffMember, req.body);
    res.status(201).json(attendance);
  } catch (err) {
    next(err);
  }
}

async function punchOut(req, res, next) {
  try {
    const errors = validatePunch(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const staffMember = await requireOwnStaffMember(req);

    const attendance = await attendanceService.punchOut(req.tenant.businessId, staffMember, req.body);
    res.json(attendance);
  } catch (err) {
    next(err);
  }
}

async function getMyAttendance(req, res, next) {
  try {
    const errors = validateMonthYearQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const staffMember = await requireOwnStaffMember(req);

    const records = await attendanceService.getMonthlyAttendance(
      req.tenant.businessId,
      staffMember.id,
      Number(req.query.month),
      Number(req.query.year)
    );
    res.json(records);
  } catch (err) {
    next(err);
  }
}

// Manager/owner view of a specific staff member's month — also reachable by
// the staff member themself viewing their own record via this same route.
async function getStaffAttendance(req, res, next) {
  try {
    const errors = validateMonthYearQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) throw fail('STAFF_NOT_FOUND', 404);

    if (!canViewStaffMember(scopeOf(req), staffMember)) {
      throw fail('STAFF_ACCESS_DENIED', 403);
    }

    const records = await attendanceService.getMonthlyAttendance(
      req.tenant.businessId,
      staffMember.id,
      Number(req.query.month),
      Number(req.query.year)
    );
    res.json(records);
  } catch (err) {
    next(err);
  }
}

async function markAttendance(req, res, next) {
  try {
    const errors = validateMarkAttendance(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) throw fail('STAFF_NOT_FOUND', 404);
    if (!canMarkAttendanceFor(scopeOf(req), staffMember)) {
      throw fail('BRANCH_ACCESS_DENIED', 403);
    }

    const attendance = await attendanceService.markAttendance(
      req.tenant.businessId,
      staffMember,
      req.body,
      // Records who overrode the day, so a disputed absence is traceable.
      req.tenant.membershipId
    );
    res.status(201).json(attendance);
  } catch (err) {
    next(err);
  }
}

async function getDailyRoster(req, res, next) {
  try {
    const errors = validateRosterQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const branch = await staffService.getBranchInBusiness(req.tenant.businessId, req.params.branchId);
    if (!branch) throw fail('BRANCH_NOT_FOUND', 404);

    const roster = await attendanceService.getDailyRoster(req.tenant.businessId, branch, req.query.date);
    res.json(roster);
  } catch (err) {
    next(err);
  }
}

module.exports = { punchIn, punchOut, getMyAttendance, getStaffAttendance, markAttendance, getDailyRoster };
