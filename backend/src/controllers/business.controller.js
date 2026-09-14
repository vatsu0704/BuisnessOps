const businessService = require('../services/business.service');
const {
  validateCreateBranch,
  validateCreateMembership,
  validateBranchAccess,
} = require('../validations/business.validation');

async function createBranch(req, res, next) {
  try {
    const errors = validateCreateBranch(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const branch = await businessService.createBranch(req.tenant.businessId, req.body);
    res.status(201).json(branch);
  } catch (err) {
    next(err);
  }
}

async function listBranches(req, res, next) {
  try {
    const branches = await businessService.listBranches(req.tenant.businessId, req.branchAccess);
    res.json(branches);
  } catch (err) {
    next(err);
  }
}

async function getBranch(req, res, next) {
  try {
    const branch = await businessService.getBranch(req.tenant.businessId, req.params.branchId);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    next(err);
  }
}

async function createMembership(req, res, next) {
  try {
    const errors = validateCreateMembership(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const membership = await businessService.createMembership(req.tenant.businessId, req.body);
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
}

async function addBranchAccess(req, res, next) {
  try {
    const errors = validateBranchAccess(req.body);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const access = await businessService.addBranchAccess(
      req.tenant.businessId,
      req.params.membershipId,
      req.body.branchId
    );
    res.status(201).json(access);
  } catch (err) {
    next(err);
  }
}

module.exports = { createBranch, listBranches, getBranch, createMembership, addBranchAccess };
