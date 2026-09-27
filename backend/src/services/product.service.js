const prisma = require('../config/db');
const { fail } = require('../errors');

/**
 * The product catalog — requirement 4.
 *
 * Two scopes in one table. A product with no `branchId` belongs to the whole
 * business and every branch sells it; one with a `branchId` exists only there.
 * So "this branch's catalog" is a single filter rather than a union, and moving
 * a product between the two scopes is one column.
 *
 * Price works the same way: `Product.costPrice`/`sellPrice` are the business
 * default and a `ProductBranchDetail` row overrides them for one branch. A
 * product priced the same everywhere therefore needs no per-branch rows at all,
 * which is what stops the override table growing to products x branches for no
 * reason.
 */

// Everything a client needs to render a catalog row, including the per-branch
// overrides so the caller can resolve an effective price without a second query.
const PRODUCT_SELECT = {
  id: true,
  businessId: true,
  branchId: true,
  name: true,
  sku: true,
  category: true,
  unit: true,
  costPrice: true,
  sellPrice: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Resolve what a product actually costs and sells for at one branch, and
 * whether it is on sale there.
 *
 * One place, because three callers will need the same answer and disagreeing
 * about a price is the kind of bug nobody notices until the till is short: the
 * catalog screen, the counter order (Task 4) and the day-end export (Task 9).
 *
 * `isActive` is an AND, not an override: a product withdrawn business-wide is
 * withdrawn everywhere, and a branch can additionally withdraw one that is
 * still sold elsewhere. There is deliberately no way for a branch detail to
 * re-activate a product the business has switched off.
 */
function withEffectivePricing(product, branchDetail) {
  return {
    ...product,
    branchDetail: branchDetail ?? null,
    effectiveCostPrice: branchDetail?.costPrice ?? product.costPrice ?? null,
    effectiveSellPrice: branchDetail?.sellPrice ?? product.sellPrice ?? null,
    effectiveIsActive: product.isActive && (branchDetail ? branchDetail.isActive : true),
  };
}

/**
 * The catalog, optionally as one branch sees it.
 *
 * With `branchId`: business-wide products plus that branch's own, each carrying
 * the effective price for that branch. This is what Home renders after login.
 *
 * Without: every product in the business, for a manager comparing branches.
 * `accessibleBranchIds` still narrows it — a branch-scoped role must not
 * discover another branch's private products by omitting the filter.
 */
async function listProducts(businessId, accessibleBranchIds, { branchId, includeInactive = false } = {}) {
  const where = { businessId };

  if (branchId) {
    // NULL branchId is the business-wide catalog; OR-ing it in is what makes
    // "everything this branch sells" one query.
    where.OR = [{ branchId: null }, { branchId }];
  } else if (accessibleBranchIds !== null) {
    where.OR = [{ branchId: null }, { branchId: { in: accessibleBranchIds } }];
  }

  if (!includeInactive) where.isActive = true;

  const products = await prisma.product.findMany({
    where,
    select: {
      ...PRODUCT_SELECT,
      // Only the branch being asked about. Pulling every branch's overrides
      // would make a large catalog's response grow with the branch count.
      branchDetails: branchId
        ? { where: { branchId }, select: { branchId: true, costPrice: true, sellPrice: true, isActive: true } }
        : { select: { branchId: true, costPrice: true, sellPrice: true, isActive: true } },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  if (!branchId) return products;

  return products
    .map(({ branchDetails, ...product }) => withEffectivePricing(product, branchDetails[0]))
    .filter((product) => includeInactive || product.effectiveIsActive);
}

async function getProduct(businessId, productId) {
  return prisma.product.findFirst({
    where: { id: productId, businessId },
    select: { ...PRODUCT_SELECT, branchDetails: true },
  });
}

/**
 * `branchId: null` (or omitted) creates a business-wide product; a branchId
 * creates one only that branch sells. The caller's reach over that branch is
 * checked in the controller, where the request's scope lives.
 */
async function createProduct(businessId, data) {
  return prisma.product.create({
    data: {
      businessId,
      branchId: data.branchId ?? null,
      name: data.name,
      sku: data.sku ?? null,
      category: data.category ?? null,
      unit: data.unit,
      costPrice: data.costPrice ?? null,
      sellPrice: data.sellPrice ?? null,
    },
    select: PRODUCT_SELECT,
  });
}

async function updateProduct(businessId, productId, data) {
  const existing = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!existing) throw fail('PRODUCT_NOT_FOUND', 404);

  const patch = {};
  for (const field of ['name', 'sku', 'category', 'unit', 'costPrice', 'sellPrice', 'isActive']) {
    if (data[field] !== undefined) patch[field] = data[field];
  }
  // Explicit null is meaningful: it promotes a branch-only product to the whole
  // business. Omitting the key leaves the scope alone.
  if (data.branchId !== undefined) patch.branchId = data.branchId;

  return prisma.product.update({ where: { id: productId }, data: patch, select: PRODUCT_SELECT });
}

/**
 * Set or clear one branch's price override.
 *
 * Upsert rather than create-or-update at the call site, because
 * `@@unique([productId, branchId])` already makes "one override per branch" the
 * rule and a read-then-write would race two cashiers editing the same product.
 */
async function setBranchPricing(businessId, productId, branchId, data) {
  const product = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!product) throw fail('PRODUCT_NOT_FOUND', 404);

  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) throw fail('BRANCH_NOT_FOUND_IN_BUSINESS', 404);

  // A branch cannot price a product that belongs to a different branch.
  if (product.branchId && product.branchId !== branchId) {
    throw fail('PRODUCT_NOT_SOLD_AT_BRANCH', 400);
  }

  const values = {
    costPrice: data.costPrice,
    sellPrice: data.sellPrice,
    isActive: data.isActive ?? true,
  };

  return prisma.productBranchDetail.upsert({
    where: { productId_branchId: { productId, branchId } },
    create: { productId, branchId, ...values },
    update: values,
  });
}

/** Drop the override, so the branch falls back to the business-wide price. */
async function clearBranchPricing(businessId, productId, branchId) {
  const product = await prisma.product.findFirst({ where: { id: productId, businessId } });
  if (!product) throw fail('PRODUCT_NOT_FOUND', 404);

  const existing = await prisma.productBranchDetail.findUnique({
    where: { productId_branchId: { productId, branchId } },
  });
  if (!existing) throw fail('PRODUCT_BRANCH_PRICING_NOT_FOUND', 404);

  return prisma.productBranchDetail.delete({ where: { id: existing.id } });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  setBranchPricing,
  clearBranchPricing,
  withEffectivePricing,
};
