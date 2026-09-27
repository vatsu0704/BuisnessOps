const productService = require('../services/product.service');
const { fail, validationFailure } = require('../errors');
const { canReachBranch, scopeOf } = require('../middleware/staffScope');
const {
  validateCreateProduct,
  validateUpdateProduct,
  validateBranchPricing,
  validateProductQuery,
} = require('../validations/product.validation');

/**
 * The branch a request is about arrives as a query param or a body field, not
 * as a route param, so `requireBranchAccess` (which reads `req.params`) cannot
 * gate it. The check happens here instead, against the same `req.branchAccess`
 * scope that middleware would have used.
 *
 * Without this, a cashier scoped to one branch could read or price another
 * branch's catalog just by naming it.
 */
function assertReachable(req, branchId) {
  if (!branchId) return;
  if (!canReachBranch(scopeOf(req), branchId)) throw fail('BRANCH_ACCESS_DENIED', 403);
}

async function listProducts(req, res, next) {
  try {
    const errors = validateProductQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const branchId = req.query.branchId || undefined;
    assertReachable(req, branchId);

    const products = await productService.listProducts(req.tenant.businessId, req.branchAccess, {
      branchId,
      includeInactive: String(req.query.includeInactive) === 'true',
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const product = await productService.getProduct(req.tenant.businessId, req.params.productId);
    if (!product) throw fail('PRODUCT_NOT_FOUND', 404);
    assertReachable(req, product.branchId);
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    const errors = validateCreateProduct(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    // Creating a branch-only product requires reaching that branch. Creating a
    // business-wide one (no branchId) requires all-branch reach, or a cashier
    // could add a product to every other branch's catalog from their own.
    if (req.body.branchId) {
      assertReachable(req, req.body.branchId);
    } else if (req.branchAccess !== null) {
      throw fail('PRODUCT_BUSINESS_WIDE_NOT_PERMITTED', 403);
    }

    const product = await productService.createProduct(req.tenant.businessId, req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const errors = validateUpdateProduct(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const existing = await productService.getProduct(req.tenant.businessId, req.params.productId);
    if (!existing) throw fail('PRODUCT_NOT_FOUND', 404);

    // Reach over where it is now...
    assertReachable(req, existing.branchId);
    if (existing.branchId === null && req.branchAccess !== null) {
      throw fail('PRODUCT_BUSINESS_WIDE_NOT_PERMITTED', 403);
    }
    // ...and over where it is being moved to. Promoting a branch product to the
    // whole business (branchId: null) is an all-branch act, so a branch-scoped
    // role cannot do it — otherwise a cashier could push their product into
    // every branch's catalog.
    if (req.body.branchId !== undefined) {
      if (req.body.branchId === null && req.branchAccess !== null) {
        throw fail('PRODUCT_BUSINESS_WIDE_NOT_PERMITTED', 403);
      }
      assertReachable(req, req.body.branchId);
    }

    const product = await productService.updateProduct(
      req.tenant.businessId,
      req.params.productId,
      req.body
    );
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function setBranchPricing(req, res, next) {
  try {
    const errors = validateBranchPricing(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    assertReachable(req, req.params.branchId);

    const detail = await productService.setBranchPricing(
      req.tenant.businessId,
      req.params.productId,
      req.params.branchId,
      req.body
    );
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

async function clearBranchPricing(req, res, next) {
  try {
    assertReachable(req, req.params.branchId);

    const removed = await productService.clearBranchPricing(
      req.tenant.businessId,
      req.params.productId,
      req.params.branchId
    );
    res.json(removed);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  setBranchPricing,
  clearBranchPricing,
};
