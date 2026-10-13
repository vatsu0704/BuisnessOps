import { apiClient } from './client';
import type { BranchProduct, Product, ProductBranchDetail } from '@/types/product';

/** One branch's catalog, with each product's effective price at that branch. */
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

/** A product with every branch's own price — what the edit page starts from. */
export interface ProductWithBranchPrices extends Product {
  branchDetails: ProductBranchDetail[];
}

export async function getProduct(businessId: string, productId: string): Promise<ProductWithBranchPrices> {
  const { data } = await apiClient.get<ProductWithBranchPrices>(`/businesses/${businessId}/products/${productId}`);
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

export async function createProduct(businessId: string, payload: CreateProductPayload): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/businesses/${businessId}/products`, payload);
  return data;
}

/**
 * A partial update. `null` clears a value and leaving a key out leaves it alone —
 * the backend tells them apart, as with a branch's geofence.
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
  const { data } = await apiClient.patch<Product>(`/businesses/${businessId}/products/${productId}`, payload);
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

/** Drop the override, so this branch charges the business-wide price again. */
export async function clearBranchPricing(businessId: string, productId: string, branchId: string): Promise<void> {
  await apiClient.delete(`/businesses/${businessId}/products/${productId}/branches/${branchId}/pricing`);
}
