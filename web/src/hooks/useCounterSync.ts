import { useEffect } from 'react';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useAuthStore } from '@/store/authStore';
import { useCounterStore } from '@/store/counterStore';
import { kickCounterSync, stopCounterSync } from '@/utils/counterSync';
import { hasCapability } from '@/utils/permissions';

/**
 * Keeps the counter's unsent sales moving for as long as somebody who bills is
 * signed in (requirement 30) — not only while the Counter page is open, so bills
 * taken offline are sent when the connection returns even if the cashier has
 * moved to another page. The app's `useCounterSync`, with the browser's events:
 * the tab coming back into view, and the connection coming back.
 *
 * Mounted in AppShell, which exists for exactly as long as a session does.
 */
export function useCounterSync() {
  const businessId = useBusinessId();
  const bills = hasCapability(useMembership(), 'counterOrder:create');
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

  // A page that opened offline (from the kept session) learns the session is
  // live again the moment a sync gets through.
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
    const onVisible = () => {
      if (document.visibilityState === 'visible') void kickCounterSync();
    };
    const onOnline = () => void kickCounterSync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      stopCounterSync();
    };
  }, [bills]);
}
