import { useCallback, useEffect, useState } from 'react';
import { listBranches } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import type { Branch } from '@/types/branch';
import { useBusinessId } from '@/hooks/useBusinessId';

export function useBranches() {
  const businessId = useBusinessId();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) {
      setBranches([]);
      setIsLoading(false);
      return;
    }
    try {
      setError(null);
      setBranches(await listBranches(businessId));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await load();
  }, [load]);

  const active = branches.filter((b) => b.status === 'ACTIVE').length;
  const cities = new Set(branches.map((b) => b.city).filter(Boolean)).size;

  return { branches, isLoading, error, refresh, stats: { total: branches.length, active, cities } };
}
