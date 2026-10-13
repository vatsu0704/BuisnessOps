import { parseOptionalNumber } from '@/utils/validation';

type Catalogued = { name: string; sku: string | null; category: string | null };

/**
 * A long catalog grouped by category so it can be scanned, groups in
 * alphabetical order. Products with no category collect under one heading
 * rather than being dropped or scattered — the app's Products screen.
 */
export function groupByCategory<T extends Catalogued>(products: T[], uncategorised: string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const product of products) {
    const key = product.category?.trim() || uncategorised;
    const list = groups.get(key) ?? [];
    list.push(product);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Whether a product answers what was typed in the search box: its name, code or category. */
export function matchesQuery(product: Catalogued, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [product.name, product.sku, product.category].some((field) => field?.toLocaleLowerCase().includes(needle));
}

export type BranchPriceAction =
  | { kind: 'save'; sellPrice: number; costPrice: number }
  | { kind: 'clear' }
  | { kind: 'none' };

/**
 * What saving the "price at one branch" fields would do. Both prices or neither:
 * half an override would silently half-apply, so one price alone does nothing.
 * Both blank means "charge the business price here again", which only means
 * something when the branch has a price of its own to drop.
 */
export function branchPriceAction(sell: string, cost: string, hasOverride: boolean): BranchPriceAction {
  const sellPrice = parseOptionalNumber(sell);
  const costPrice = parseOptionalNumber(cost);
  if (sellPrice === undefined && costPrice === undefined) return hasOverride ? { kind: 'clear' } : { kind: 'none' };
  if (sellPrice === undefined || costPrice === undefined || sellPrice === null || costPrice === null) {
    return { kind: 'none' };
  }
  return { kind: 'save', sellPrice, costPrice };
}
