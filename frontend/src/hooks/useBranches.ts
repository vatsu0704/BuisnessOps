import { useEffect, useMemo } from 'react';
import { useBranchStore } from '@/store/branchStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { Branch } from '@/types/branch';

/** Stable empty array, so the selector below does not return a new one each render. */
const NO_BRANCHES: Branch[] = [];

/**
 * The branch list for the business currently being acted under.
 *
 * The shape is unchanged from when this held its own `useState` — twelve
 * components call it and none of them needed editing — but the data now lives
 * in `branchStore`, so they are all views of **one** list. Adding a branch
 * updates every one of them at once, instead of only whichever copy happened
 * to refetch. See the store's header for what went wrong before.
 */
export function useBranches() {
  const businessId = useBusinessId();

  const load = useBranchStore((s) => s.load);
  const refresh = useBranchStore((s) => s.refresh);
  const error = useBranchStore((s) => s.error);

  // Only hand back a list that belongs to this business. Checking `loadedFor`
  // rather than trusting the array is what stops the previous tenant's branches
  // flashing for one frame after a business switch.
  const branches = useBranchStore((s) => (s.loadedFor === businessId ? s.branches : NO_BRANCHES));

  // "Not loaded yet" counts as loading, so a screen shows its spinner rather
  // than its "no branches yet" empty state in the moment before the first
  // fetch resolves.
  const isLoading = useBranchStore((s) =>
    businessId ? s.isLoading || s.loadedFor !== businessId : false
  );

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  /**
   * The locations goods actually move through.
   *
   * **The rule: `tradingBranches` where goods move, `branches` where people
   * are.** A warehouse is a real location — it has staff, attendance, a
   * geofence and a roster — so it belongs in every picker that asks "where does
   * this person work". It has no counter and does not order raw material from
   * itself, so it belongs in none of the pickers that ask "where is this being
   * sold or ordered". Getting that backwards puts a till in a warehouse, which
   * the server refuses anyway (`BRANCH_IS_WAREHOUSE`) — but a control that
   * 400s is a control that should not have been offered.
   */
  const tradingBranches = useMemo(() => branches.filter((b) => b.kind === 'BRANCH'), [branches]);

  const stats = useMemo(
    () => ({
      // Every location, which is what "is this business set up yet?" means.
      total: branches.length,
      // The selling network, which is what a figure labelled "branches" means
      // to the person reading it.
      trading: tradingBranches.length,
      active: branches.filter((b) => b.status === 'ACTIVE').length,
      cities: new Set(branches.map((b) => b.city).filter(Boolean)).size,
    }),
    [branches, tradingBranches]
  );

  return { branches, tradingBranches, isLoading, error, refresh, stats };
}
