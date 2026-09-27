import { apiClient } from '@/api/client';
import type { BranchProduct, Product, ProductBranchDetail } from '@/types/product';

/**
 * The catalog as one branch sees it: business-wide products plus that branch's
 * own, each carrying the price that branch actually charges.
 *
 * This is what Home renders after login (requirement 4).
 */
export async function listBranchProducts(
  businessId: string,
  branchId: string,
  options: { includeInactive?: boolean } = {}
): Promise<BranchProduct[]> {
  const { data } = await apiClient.get<BranchProduct[]>(`/businesses/${businessId}/products`, {
    params: { branchId, includeInactive: options.includeInactive ? 'true' : undefined },
  });
  return data;
}

/**
 * Every product in the business, for someone comparing branches. Returns plain
 * products with no effective pricing, because "effective" only means something
 * relative to one branch.
 */
export async function listProducts(
  businessId: string,
  options: { includeInactive?: boolean } = {}
): Promise<Product[]> {
  const { data } = await apiClient.get<Product[]>(`/businesses/${businessId}/products`, {
    params: { includeInactive: options.includeInactive ? 'true' : undefined },
  });
  return data;
}

export async function getProduct(businessId: string, productId: string): Promise<Product> {
  const { data } = await apiClient.get<Product>(`/businesses/${businessId}/products/${productId}`);
  return data;
}

export interface CreateProductPayload {
  name: string;
  unit: string;
  sku?: string;
  category?: string;
  costPrice?: number;
  sellPrice?: number;
  /** Omit for a product the whole business sells; set it for a branch's own. */
  branchId?: string;
}

export async function createProduct(
  businessId: string,
  payload: CreateProductPayload
): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/businesses/${businessId}/products`, payload);
  return data;
}

/**
 * Partial update. `branchId: null` promotes a branch product to the whole
 * business, so omitting the key and sending null mean different things — as
 * with `geofenceRadiusMeters` on a branch.
 */
export interface UpdateProductPayload {
  name?: string;
  unit?: string;
  sku?: string | null;
  category?: string | null;
  costPrice?: number | null;
  sellPrice?: number | null;
  isActive?: boolean;
  branchId?: string | null;
}

export async function updateProduct(
  businessId: string,
  productId: string,
  payload: UpdateProductPayload
): Promise<Product> {
  const { data } = await apiClient.patch<Product>(
    `/businesses/${businessId}/products/${productId}`,
    payload
  );
  return data;
}

/** Both prices are required: half an override would silently half-apply. */
export async function setBranchPricing(
  businessId: string,
  productId: string,
  branchId: string,
  payload: { costPrice: number; sellPrice: number; isActive?: boolean }
): Promise<ProductBranchDetail> {
  const { data } = await apiClient.put<ProductBranchDetail>(
    `/businesses/${businessId}/products/${productId}/branches/${branchId}/pricing`,
    payload
  );
  return data;
}

/** Drop the override so this branch falls back to the business-wide price. */
export async function clearBranchPricing(
  businessId: string,
  productId: string,
  branchId: string
): Promise<void> {
  await apiClient.delete(
    `/businesses/${businessId}/products/${productId}/branches/${branchId}/pricing`
  );
}
