const express = require('express');
const vendorController = require('../controllers/vendor.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission, requirePlanFeature } = require('../middleware/rbac');

/**
 * Third-party vendors and payees — requirements 25 and 26.
 *
 * Guards stay per-route, never a blanket `scoped.use(...)` — see
 * dataSource.routes.js for why.
 */

const router = express.Router();
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// --- Vendors -----------------------------------------------------------------
// The list rides on the catalog's capabilities, because a vendor is part of the
// catalog: anyone who can see what may be ordered can see who supplies it, and
// the desk that runs the catalog adds and withdraws suppliers.
scoped.get('/vendors', requirePermission('supplyItem:view'), vendorController.listVendors);
// Adding a vendor is part of the Franchise plan (requirement 28). Editing,
// withdrawing and paying one that already exists are not gated by the plan: a
// business that moves down keeps the vendors it has, and must be able to wind
// them down.
scoped.post(
  '/vendors',
  requirePermission('supplyItem:manage'),
  requirePlanFeature('vendors'),
  vendorController.createVendor
);
scoped.patch('/vendors/:vendorId', requirePermission('supplyItem:manage'), vendorController.updateVendor);

// --- Where the money goes ------------------------------------------------------
// Its own capability, and deliberately not the desk's. `supplyItem:manage` can
// rename a vendor; only `paymentAccount:manage` can change whose account a
// payment to them lands in. See the note on that capability in the catalog.
scoped.patch(
  '/vendors/:vendorId/upi',
  requirePermission('paymentAccount:manage'),
  vendorController.setVendorUpi
);
scoped.get('/payment-account', requirePermission('paymentAccount:manage'), vendorController.getPaymentAccount);
scoped.patch('/payment-account', requirePermission('paymentAccount:manage'), vendorController.setPaymentAccount);

router.use('/:businessId', scoped);

module.exports = router;
