import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { getMyStaffMember } from '@/api/staff';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { MyStaffMember } from '@/types/staffing';

/**
 * "Am I a staff member of this business, and which record am I?"
 *
 * Backed by GET /staff/me. The screens used to discover this by calling a
 * *month* attendance endpoint and reading its 404, which conflated "no
 * attendance recorded" with "not staff here" — and meant a brand-new employee
 * was told they weren't registered.
 *
 * `isStaff === false` is a legitimate answer, not an error: most people using
 * the app as an owner have no StaffMember row at all.
 */
export function useMyStaffMember() {
  const businessId = useBusinessId();
  const [staffMember, setStaffMember] = useState<MyStaffMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setStaffMember(await getMyStaffMember(businessId));
    } catch (err) {
      // A 404 means "you are not staff here", which is an answer rather than a
      // failure. Anything else is a real error worth surfacing.
      if (axios.isAxiosError(err) && err.response?.status === 404) setStaffMember(null);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { staffMember, isStaff: !!staffMember, isLoading, error, refresh: load };
}
