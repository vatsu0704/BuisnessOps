import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useAuthStore } from '@/store/authStore';
import { useCounterStore } from '@/store/counterStore';
import { kickCounterSync, stopCounterSync } from '@/utils/counterSync';
import { can } from '@/utils/permissions';

/**
 * Keeps the counter's unsent sales moving for as long as somebody who bills is
 * signed in (requirement 30) — not only while the Counter screen is open, so
 * bills made offline are sent when the connection returns even if the cashier
 * has moved on to another screen.
 *
 * Mounted in AppNavigator, which exists for exactly as long as a session does.
 */
export function useCounterSync() {
  const businessId = useBusinessId();
  const membership = useMembership();
  const bills = can.useCounter(membership);
  const load = useCounterStore((s) => s.load);

  useEffect(() => {
    if (!businessId || !bills) return;
    let cancelled = false;
    void load(businessId).then(() => {
      if (!cancelled) void kickCounterSync();
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, bills, load]);

  // An app that opened offline (from the cached session) learns the session is
  // live again the moment a sync gets through, rather than at the next resume.
  useEffect(
    () =>
      useCounterStore.subscribe((state, previous) => {
        if (state.syncState === 'idle' && previous.syncState === 'syncing' && useAuthStore.getState().isOfflineSession) {
          void useAuthStore.getState().refreshSession();
        }
      }),
    []
  );

  useEffect(() => {
    if (!bills) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void kickCounterSync();
    });
    return () => {
      subscription.remove();
      stopCounterSync();
    };
  }, [bills]);
}
