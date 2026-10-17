import { useCallback } from 'react';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useTodayStore } from '@/store/todayStore';
import { hasCapability } from '@/utils/permissions';

/**
 * Today's figures for the business in hand (requirement 33). Somebody without
 * `analytics:viewToday` gets nothing and makes no request that would be refused.
 */
export function useToday() {
  const businessId = useBusinessId();
  const allowed = hasCapability(useMembership(), 'analytics:viewToday');
  const today = useTodayStore((s) => (allowed && s.loadedFor === businessId ? s.today : null));
  const isLoading = useTodayStore((s) => (allowed ? s.isLoading : false));
  const error = useTodayStore((s) => (allowed ? s.error : null));
  const load = useTodayStore((s) => s.load);

  const refresh = useCallback(async () => {
    if (allowed) await load(businessId);
  }, [allowed, businessId, load]);

  return { today, isLoading, error, refresh, allowed };
}
