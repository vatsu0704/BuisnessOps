const businessService = require('../services/business.service');
const { fail, validationFailure } = require('../errors');
const inviteService = require('../services/invite.service');
const {
  validateCreateBranch,
  validateUpdateBranch,
  validateCreateMembership,
  validateBranchAccess,
} = require('../validations/business.validation');

async function createBranch(req, res, next) {
  try {
    const errors = validateCreateBranch(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const branch = await businessService.createBranch(req.tenant.businessId, req.body);
    res.status(201).json(branch);
  } catch (err) {
    next(err);
  }
}

// Makes timezone and the geofence editable after creation. Both were
// write-once, and a wrong timezone silently files punches against the wrong
// calendar day near local midnight.
async function updateBranch(req, res, next) {
  try {
    const errors = validateUpdateBranch(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const branch = await businessService.updateBranch(
      req.tenant.businessId,
      req.params.branchId,
      req.body
    );
    res.json(branch);
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
    if (!branch) throw fail('BRANCH_NOT_FOUND', 404);
    res.json(branch);
  } catch (err) {
    next(err);
  }
}

async function createMembership(req, res, next) {
  try {
    const errors = validateCreateMembership(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const result = await inviteService.inviteMember(req.tenant.businessId, req.body);
    res.status(201).json(result.pending ? { pending: true, ...result.invite } : { pending: false, ...result.membership });
  } catch (err) {
    next(err);
  }
}

async function listMemberships(req, res, next) {
  try {
    const memberships = await businessService.listMemberships(req.tenant.businessId);
    res.json(memberships);
  } catch (err) {
    next(err);
  }
}

async function listInvites(req, res, next) {
  try {
    const invites = await inviteService.listInvites(req.tenant.businessId);
    res.json(invites);
  } catch (err) {
    next(err);
  }
}

async function addBranchAccess(req, res, next) {
  try {
    const errors = validateBranchAccess(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

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

async function listTransactions(req, res, next) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const transactions = await businessService.listTransactions(req.tenant.businessId, req.params.branchId, {
      limit,
    });
    res.json(transactions);
  } catch (err) {
    next(err);
  }
}

async function getSalesSummary(req, res, next) {
  try {
    const rows = await businessService.getSalesSummary(req.tenant.businessId, req.branchAccess);
    const byCurrency = rows.map((row) => ({
      currency: row.currency,
      totalSales: row._sum.totalAmount ?? 0,
      transactionCount: row._count,
    }));
    res.json({ byCurrency });
  } catch (err) {
    next(err);
  }
}

// The business the caller is currently acting under. resolveTenant has
// already proven they belong to it, so no further check is needed here.
async function getBusiness(req, res, next) {
  try {
    const business = await businessService.getBusiness(req.tenant.businessId);
    if (!business) throw fail('BUSINESS_NOT_FOUND', 404);
    res.json(business);
  } catch (err) {
    next(err);
  }
}

// The actor is taken from req.tenant, never from the body: which membership
// is doing the revoking decides whether it is allowed at all (self-revoke,
// admin-revoking-owner, last-owner), so it has to come from the session.
async function revokeMembership(req, res, next) {
  try {
    const membership = await businessService.revokeMembership(
      req.tenant.businessId,
      req.params.membershipId,
      { membershipId: req.tenant.membershipId, role: req.tenant.role }
    );
    res.json(membership);
  } catch (err) {
    next(err);
  }
}

async function removeBranchAccess(req, res, next) {
  try {
    const removed = await businessService.removeBranchAccess(
      req.tenant.businessId,
      req.params.membershipId,
      req.params.branchId
    );
    res.json(removed);
  } catch (err) {
    next(err);
  }
}

async function revokeInvite(req, res, next) {
  try {
    const invite = await inviteService.revokeInvite(req.tenant.businessId, req.params.inviteId);
    res.json(invite);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBusiness,
  createBranch,
  updateBranch,
  listBranches,
  getBranch,
  createMembership,
  listMemberships,
  listInvites,
  revokeInvite,
  addBranchAccess,
  removeBranchAccess,
  revokeMembership,
  listTransactions,
  getSalesSummary,
};
