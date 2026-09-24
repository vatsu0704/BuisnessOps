const express = require('express');
const productController = require('../controllers/product.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

// The eighth router mounted on '/businesses'. Guards stay per-route rather than
// a blanket `scoped.use(...)` for the reason spelled out in
// dataSource.routes.js: Express runs a non-path-scoped `.use()` before route
// matching, so a blanket gate here would reject other resources' requests that
// merely pass through this router on their way to theirs.
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// `?branchId=` narrows to one branch's catalog — business-wide products plus
// that branch's own, each with the price that branch actually charges. This is
// what Home renders after login (requirement 4).
scoped.get('/products', requirePermission('product:view'), productController.listProducts);
scoped.get('/products/:productId', requirePermission('product:view'), productController.getProduct);

scoped.post('/products', requirePermission('product:manage'), productController.createProduct);
scoped.patch('/products/:productId', requirePermission('product:manage'), productController.updateProduct);

// Per-branch price and availability. Separate from the product itself because
// they answer a different question — "what does this cost here?" rather than
// "what is this?" — and because a branch may set one without being allowed to
// edit the other.
scoped.put(
  '/products/:productId/branches/:branchId/pricing',
  requirePermission('product:manage'),
  productController.setBranchPricing
);
scoped.delete(
  '/products/:productId/branches/:branchId/pricing',
  requirePermission('product:manage'),
  productController.clearBranchPricing
);

router.use('/:businessId', scoped);

module.exports = router;
