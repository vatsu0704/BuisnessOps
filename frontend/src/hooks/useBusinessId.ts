import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { activeMembership } from '@/utils/permissions';

/**
 * The business the app is currently acting under.
 *
 * Every screen used to inline `user?.memberships?.[0]?.businessId`. Routing it
 * through one hook is what made a real switcher possible: the choice lives on
 * the store, and every scoped request picks it up here without any screen
 * knowing a switcher exists.
 *
 * Undefined means there is no business to act under — signed out, or revoked
 * from every business. Callers already guard on that before making a request.
 */
export function useBusinessId(): string | undefined {
  return useMembership()?.businessId;
}

/** The membership itself, for role checks via `can.*`. */
export function useMembership() {
  const user = useAuthStore((s) => s.user);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  // Both selectors return primitives/stable references, so this only
  // recomputes when the account or the chosen business actually changes.
  return useMemo(() => activeMembership(user, activeBusinessId), [user, activeBusinessId]);
}
