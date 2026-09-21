const staffService = require('../services/staff.service');
const { canViewStaffMember, canManageStaffMember, canViewPayroll, scopeOf } = require('../middleware/staffScope');
const { validateCreateStaff, validateUpdateStaff } = require('../validations/staff.validation');

async function createStaffMember(req, res, next) {
  try {
    const errors = validateCreateStaff(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    // MANAGER can only staff branches they themselves have access to.
    if (req.tenant.role === 'MANAGER' && req.branchAccess !== null && !req.branchAccess.includes(req.body.branchId)) {
      return res.status(403).json({ message: 'You do not have access to this branch' });
    }
    if (req.body.baseSalary !== undefined && req.body.baseSalary !== null && !canViewPayroll(scopeOf(req))) {
      return res.status(403).json({ message: 'Only an owner or admin can set pay' });
    }

    const staffMember = await staffService.createStaffMember(req.tenant.businessId, req.body);
    res.status(201).json(staffMember);
  } catch (err) {
    next(err);
  }
}

async function listStaffMembers(req, res, next) {
  try {
    const staff = await staffService.listStaffMembers(req.tenant.businessId, req.branchAccess, {
      role: req.tenant.role,
      userId: req.userId,
    });
    res.json(staff);
  } catch (err) {
    next(err);
  }
}

/**
 * "Am I a staff member of this business, and which row am I?" — the Home punch
 * card and the personal view of the Staff tab both start here. Previously the
 * app discovered this by calling a *month* endpoint and reading its 404, which
 * conflated "no attendance" with "not staff".
 */
async function getMyStaffMember(req, res, next) {
  try {
    const staffMember = await staffService.getStaffMemberByUserId(req.tenant.businessId, req.userId);
    if (!staffMember) {
      return res.status(404).json({ message: 'You are not registered as a staff member of this business' });
    }
    const branch = await staffService.getBranchInBusiness(req.tenant.businessId, staffMember.branchId);
    res.json({
      ...staffMember,
      // Pay is the person's own, so it is fine to return; the branch travels
      // with it because the card needs the timezone and the geofence flag.
      branch: branch && {
        id: branch.id,
        name: branch.name,
        timezone: branch.timezone,
        geofenceRadiusMeters: branch.geofenceRadiusMeters,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getStaffMember(req, res, next) {
  try {
    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });
    // Also fixes the inverse of the old bug: a STAFF member whose membership
    // carries no BranchAccess rows could not read their OWN record here.
    if (!canViewStaffMember(scopeOf(req), staffMember)) {
      return res.status(403).json({ message: 'You do not have access to this staff member' });
    }
    res.json(staffMember);
  } catch (err) {
    next(err);
  }
}

async function updateStaffMember(req, res, next) {
  try {
    const errors = validateUpdateStaff(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });

    const scope = scopeOf(req);
    if (!canManageStaffMember(scope, staffMember)) {
      return res.status(403).json({ message: 'You do not have access to this staff member' });
    }
    // A MANAGER runs their branch's people; they do not set anyone's pay.
    if (req.body.baseSalary !== undefined && !canViewPayroll(scope)) {
      return res.status(403).json({ message: 'Only an owner or admin can change pay' });
    }
    // Moving someone requires reaching the destination as well as the origin.
    if (req.body.branchId !== undefined && req.branchAccess !== null && !req.branchAccess.includes(req.body.branchId)) {
      return res.status(403).json({ message: 'You do not have access to the destination branch' });
    }

    const updated = await staffService.updateStaffMember(
      req.tenant.businessId,
      req.params.staffMemberId,
      req.body
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

function setStatus(status) {
  return async function handler(req, res, next) {
    try {
      const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
      if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });
      if (!canManageStaffMember(scopeOf(req), staffMember)) {
        return res.status(403).json({ message: 'You do not have access to this staff member' });
      }
      const updated = await staffService.setStaffStatus(req.tenant.businessId, req.params.staffMemberId, status);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  createStaffMember,
  listStaffMembers,
  getMyStaffMember,
  getStaffMember,
  updateStaffMember,
  deactivateStaffMember: setStatus('INACTIVE'),
  reactivateStaffMember: setStatus('ACTIVE'),
};
