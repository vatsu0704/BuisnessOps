const staffService = require('../services/staff.service');
const { validateCreateStaff } = require('../validations/staff.validation');

async function createStaffMember(req, res, next) {
  try {
    const errors = validateCreateStaff(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    // MANAGER can only staff branches they themselves have access to.
    if (req.tenant.role === 'MANAGER' && req.branchAccess !== null && !req.branchAccess.includes(req.body.branchId)) {
      return res.status(403).json({ message: 'You do not have access to this branch' });
    }

    const staffMember = await staffService.createStaffMember(req.tenant.businessId, req.body);
    res.status(201).json(staffMember);
  } catch (err) {
    next(err);
  }
}

async function listStaffMembers(req, res, next) {
  try {
    const staff = await staffService.listStaffMembers(req.tenant.businessId, req.branchAccess);
    res.json(staff);
  } catch (err) {
    next(err);
  }
}

async function getStaffMember(req, res, next) {
  try {
    const staffMember = await staffService.getStaffMember(req.tenant.businessId, req.params.staffMemberId);
    if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });
    if (req.branchAccess !== null && !req.branchAccess.includes(staffMember.branchId)) {
      return res.status(403).json({ message: 'You do not have access to this branch' });
    }
    res.json(staffMember);
  } catch (err) {
    next(err);
  }
}

module.exports = { createStaffMember, listStaffMembers, getStaffMember };
