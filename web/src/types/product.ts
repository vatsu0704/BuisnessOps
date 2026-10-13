/** Prices arrive as strings (Prisma Decimals); parse them only to format or sum. */
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
  costPrice: string | null;
  sellPrice: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A product as one branch sells it, with the server-resolved effective price. */
export interface BranchProduct extends Product {
  branchDetail: ProductBranchDetail | null;
  effectiveCostPrice: string | null;
  effectiveSellPrice: string | null;
  effectiveIsActive: boolean;
}
