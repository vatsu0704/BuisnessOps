const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

/**
 * Requirements 13 and 15 — the branch × month grid and net profit.
 *
 * Two mounts, for the same reason notification.routes.js has two: the grid
 * belongs to one business and resolves a tenant, while the cross-business
 * roll-up spans them and cannot. Exported as `{ scoped, router }` so
 * routes/index.js mounts each where it belongs.
 */

const router = express.Router();

// --- One business's grid ---------------------------------------------------
// Eleventh router on '/businesses'. Guards stay per-route, never a blanket
// `scoped.use(...)` — see dataSource.routes.js for why.
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// `analytics:viewBranch`, not `viewBusiness`. A CASHIER holds the first and is
// scoped by `req.branchAccess` to their own branch, so one endpoint answers
// "how is my branch doing?" and "how is every branch doing?" without a second
// one existing. The controller decides separately whether to attach the
// business roll-up, which is what `analytics:viewBusiness` actually gates.
scoped.get(
  '/analytics/branch-monthly',
  requirePermission('analytics:viewBranch'),
  analyticsController.getBranchMonthly
);

router.use('/:businessId', scoped);

// --- Every business this account holds -------------------------------------
// No `resolveTenant` and so no `requirePermission`: there is no businessId in
// the path to resolve a tenant from. The service filters the caller's
// memberships against `analytics:viewBusiness` off the same matrix the guard
// would have consulted, so a business where they are only a cashier is absent
// rather than refused.
const crossBusinessRouter = express.Router();
crossBusinessRouter.get('/cross-business', requireAuth, analyticsController.getCrossBusiness);

module.exports = { scoped: router, router: crossBusinessRouter };
