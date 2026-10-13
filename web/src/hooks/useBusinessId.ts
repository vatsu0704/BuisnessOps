import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { activeMembership } from '@/utils/permissions';

/** The membership the app is acting under, for capability checks. */
export function useMembership() {
  const user = useAuthStore((s) => s.user);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  return useMemo(() => activeMembership(user, activeBusinessId), [user, activeBusinessId]);
}

/** The business every scoped request goes to. Undefined when there is none to act under. */
export function useBusinessId(): string | undefined {
  return useMembership()?.businessId;
}
