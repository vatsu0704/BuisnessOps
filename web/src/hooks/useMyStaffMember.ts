import { useEffect } from 'react';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useMyStaffStore } from '@/store/myStaffStore';

/**
 * Am I on this business's staff? `isStaff === false` is a legitimate answer — an
 * owner who does not punch in — and `isLoading` stays true until it is known, so
 * a page never shows "not on the staff" for the moment before it has asked.
 */
export function useMyStaffMember() {
  const businessId = useBusinessId();
  const load = useMyStaffStore((s) => s.load);
  const refresh = useMyStaffStore((s) => s.refresh);
  const staffMember = useMyStaffStore((s) => (s.loadedFor === businessId ? s.staffMember : null));
  // A failed first answer is not "still loading": the page shows the error instead.
  const isLoading = useMyStaffStore((s) => (businessId ? s.loadedFor !== businessId && !s.error : false));
  const error = useMyStaffStore((s) => s.error);

  useEffect(() => {
    void load(businessId);
  }, [businessId, load]);

  return { staffMember, isStaff: !!staffMember, isLoading, error, refresh };
}
