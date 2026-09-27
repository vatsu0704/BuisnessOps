/**
 * Prices arrive as strings, not numbers.
 *
 * Prisma serializes `Decimal` as a string so a value that cannot be represented
 * exactly in a float does not quietly become one in transit. Keep them strings
 * until the moment they are formatted or summed, and parse deliberately rather
 * than letting `+price` happen somewhere by accident.
 */
export interface ProductBranchDetail {
  branchId: string;
  costPrice: string;
  sellPrice: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  businessId: string;
  /** null = the whole business sells it; a branchId = only that branch does. */
  branchId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  /** The business-wide default. A branch override wins over it. */
  costPrice: string | null;
  sellPrice: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * What a product costs and sells for at one particular branch, resolved by the
 * server so the fallback rule lives in one place rather than in every screen
 * that shows a price.
 *
 * Only returned when the catalog was asked for with a `branchId`.
 */
export interface BranchProduct extends Product {
  branchDetail: ProductBranchDetail | null;
  effectiveCostPrice: string | null;
  effectiveSellPrice: string | null;
  effectiveIsActive: boolean;
}
