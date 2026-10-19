// Pure: shared with the web app (web/ reads it through @shared), so it may import
// nothing but relative paths.
import type { SupplyItem, SupplyOrderItem, SupplyOrderVendor } from '../types/supply';

/** One supplier's share of the cart — what becomes one order when it is placed. */
export type SupplierGroup = {
  key: string;
  vendor: SupplyOrderVendor | null;
  lines: SupplyOrderItem[];
  subtotal: number;
};

/**
 * The cart's lines grouped the way the server will split them: by each item's
 * supplier as it is now, the warehouse first and vendors by name.
 */
export function groupBySupplier(items: SupplyOrderItem[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const line of items) {
    const vendor = line.inventoryItem?.vendor ?? null;
    const key = vendor?.id ?? 'WAREHOUSE';
    const group = groups.get(key) ?? { key, vendor, lines: [], subtotal: 0 };
    group.lines.push(line);
    group.subtotal += Number(line.lineTotal);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.vendor) return -1;
    if (!b.vendor) return 1;
    return a.vendor.name.localeCompare(b.vendor.name);
  });
}

/** One supplier's part of the catalog, its categories in order. `label` null is the warehouse. */
export type CatalogSupplier = {
  key: string;
  label: string | null;
  categories: [category: string, items: SupplyItem[]][];
};

/** Once any item comes from a vendor, the catalog is headed by who supplies each part. */
export function hasVendorItems(items: SupplyItem[]): boolean {
  return items.some((item) => item.vendorId !== null);
}

/**
 * The catalog by supplier, then category: the warehouse first and vendors by
 * name — the same order the cart splits an order in — and categories A to Z.
 *
 * `search` narrows by name, ignoring case. An item with no category is filed
 * under `uncategorised`, the caller's translation of "Other".
 */
export function groupCatalog(
  items: SupplyItem[],
  { search = '', uncategorised }: { search?: string; uncategorised: string }
): CatalogSupplier[] {
  const needle = search.trim().toLowerCase();
  const suppliers = new Map<string, { label: string | null; categories: Map<string, SupplyItem[]> }>();
  for (const item of items) {
    if (needle && !item.name.toLowerCase().includes(needle)) continue;
    const supplierKey = item.vendorId ?? '';
    const supplier = suppliers.get(supplierKey) ?? { label: item.vendor?.name ?? null, categories: new Map() };
    const category = item.category?.trim() || uncategorised;
    supplier.categories.set(category, [...(supplier.categories.get(category) ?? []), item]);
    suppliers.set(supplierKey, supplier);
  }
  return [...suppliers.entries()]
    .sort(([a, x], [b, y]) => (a === '' ? -1 : b === '' ? 1 : (x.label ?? '').localeCompare(y.label ?? '')))
    .map(([key, supplier]) => ({
      key,
      label: supplier.label,
      categories: [...supplier.categories.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }));
}

/** How many of each catalog item the cart already holds, by item id. */
export function quantitiesInCart(items: SupplyOrderItem[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of items ?? []) {
    if (line.inventoryItemId) counts.set(line.inventoryItemId, Number(line.quantity));
  }
  return counts;
}
