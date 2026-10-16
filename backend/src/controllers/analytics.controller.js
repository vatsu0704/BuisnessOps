const analyticsService = require('../services/analytics.service');
const todayService = require('../services/today.service');
const { fieldError, validationFailure } = require('../errors');
const { tenantCan } = require('../permissions');
const {
  validateDailyQuery,
  validateBranchMonthlyQuery,
  validateCrossBusinessQuery,
} = require('../validations/analytics.validation');

/**
 * Requirements 13 and 15.
 *
 * Both endpoints are reads, so there is no branch arriving in a body and no
 * `canReachBranch` check here: the grid is scoped by `req.branchAccess`, which
 * `resolveTenant` has already resolved, and the service refuses a `branchId`
 * outside it.
 */

/**
 * The branch × month grid.
 *
 * Guarded on `analytics:viewBranch` and scoped by the branch access each caller
 * already has, so the same endpoint serves somebody looking at one branch and an
 * admin looking at all of them. (A cashier no longer holds it — requirement 33
 * gave them `analytics:viewToday`, which carries no costs or profit.)
 *
 * The **business roll-up is a second decision**, made here rather than by a
 * second endpoint: it is included only for `analytics:viewBusiness`. Without
 * that split, a cashier reading their own branch's figures would be handed the
 * whole business's net profit alongside them.
 */
async function getBranchMonthly(req, res, next) {
  try {
    const errors = validateBranchMonthlyQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const grid = await analyticsService.getBranchMonthly(req.tenant.businessId, {
      from: req.query.from,
      to: req.query.to,
      branchId: req.query.branchId,
      accessibleBranchIds: req.branchAccess,
      includeBusiness: tenantCan(req.tenant, 'analytics:viewBusiness'),
    });

    res.json(grid);
  } catch (err) {
    next(err);
  }
}

/**
 * One month day by day (requirement 34), on the same guard and the same second
 * decision about the business roll-up as the monthly grid.
 */
async function getBranchDaily(req, res, next) {
  try {
    const errors = validateDailyQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    res.json(
      await analyticsService.getBranchDaily(req.tenant.businessId, {
        month: req.query.month,
        branchId: req.query.branchId,
        accessibleBranchIds: req.branchAccess,
        includeBusiness: tenantCan(req.tenant, 'analytics:viewBusiness'),
      })
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Today at a glance (requirement 33): sales, bills and — for somebody who may
 * read expenses — spending, with the latest bills for somebody who bills. Scoped
 * by the branch access the person already has, like the grid.
 */
async function getToday(req, res, next) {
  try {
    if (req.query.branchId !== undefined && typeof req.query.branchId !== 'string') {
      return res.status(400).json(validationFailure([fieldError('FIELD_MUST_BE_STRING', 'branchId')]));
    }
    const today = await todayService.getToday(req.tenant.businessId, {
      accessibleBranchIds: req.branchAccess,
      branchId: req.query.branchId,
      includeExpenses: tenantCan(req.tenant, 'expense:view'),
      includeBills: tenantCan(req.tenant, 'counterOrder:create'),
    });
    res.json(today);
  } catch (err) {
    next(err);
  }
}

/**
 * Every business this account can read, totals only.
 *
 * No `resolveTenant` and therefore no `requirePermission`: there is no single
 * business to resolve, so the service filters the caller's memberships against
 * the same capability the guard would have asked for. A business where this
 * person is not a manager or admin is absent from the list rather than refused.
 */
async function getCrossBusiness(req, res, next) {
  try {
    const errors = validateCrossBusinessQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const summary = await analyticsService.getCrossBusiness(req.userId, {
      from: req.query.from,
      to: req.query.to,
    });

    res.json(summary);
  } catch (err) {
    next(err);
  }
}

module.exports = { getBranchMonthly, getBranchDaily, getToday, getCrossBusiness };
