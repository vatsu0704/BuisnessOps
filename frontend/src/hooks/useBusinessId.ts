import { useAuthStore } from '@/store/authStore';
import { activeMembership } from '@/utils/permissions';

/**
 * The business the app is currently acting under.
 *
 * Every screen used to inline `user?.memberships?.[0]?.businessId`. Routing it
 * through one hook means the tie-break (prefer an ACTIVE membership) is applied
 * consistently, and gives a single place to change when a real business
 * switcher lands.
 */
export function useBusinessId(): string | undefined {
  return useAuthStore((s) => activeMembership(s.user)?.businessId);
}

/** The membership itself, for role checks via `can.*`. */
export function useMembership() {
  return useAuthStore((s) => activeMembership(s.user));
}
