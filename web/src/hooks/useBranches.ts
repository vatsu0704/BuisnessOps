import { useEffect, useMemo } from 'react';
import { useBranchStore } from '@/store/branchStore';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { Branch } from '@/types/branch';

const NO_BRANCHES: Branch[] = [];

/**
 * The branch list for the business being acted under — every caller is a view
 * of one list in `branchStore`.
 *
 * **`tradingBranches` where goods move, `branches` where people are.** A
 * warehouse is staffed but has no till and orders nothing from itself.
 */
export function useBranches() {
  const businessId = useBusinessId();

  const load = useBranchStore((s) => s.load);
  const refresh = useBranchStore((s) => s.refresh);
  const error = useBranchStore((s) => s.error);
  // Only a list that belongs to this business, so a switch never flashes the last one.
  const branches = useBranchStore((s) => (s.loadedFor === businessId ? s.branches : NO_BRANCHES));
  // "Not loaded yet" counts as loading, so a page shows a spinner, not its empty state.
  const isLoading = useBranchStore((s) => (businessId ? s.isLoading || s.loadedFor !== businessId : false));

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  const tradingBranches = useMemo(() => branches.filter((b) => b.kind === 'BRANCH'), [branches]);
  const warehouseBranches = useMemo(() => branches.filter((b) => b.kind === 'WAREHOUSE'), [branches]);

  const stats = useMemo(
    () => ({
      total: branches.length,
      trading: tradingBranches.length,
      active: branches.filter((b) => b.status === 'ACTIVE').length,
      cities: new Set(branches.map((b) => b.city).filter(Boolean)).size,
    }),
    [branches, tradingBranches]
  );

  return { branches, tradingBranches, warehouseBranches, isLoading, error, refresh, stats };
}
