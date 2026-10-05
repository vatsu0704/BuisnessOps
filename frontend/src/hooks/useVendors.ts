import { useEffect, useMemo } from 'react';
import { useVendorStore } from '@/store/vendorStore';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { hasCapability } from '@/utils/permissions';
import type { Vendor } from '@/types/supply';

const NO_VENDORS: Vendor[] = [];

/**
 * The business's vendors, for anyone who can see the raw-material catalog —
 * which is the capability the list endpoint is guarded by. Somebody without it
 * gets an empty list rather than a request that would 403.
 */
export function useVendors() {
  const businessId = useBusinessId();
  const membership = useMembership();
  const canRead = hasCapability(membership, 'supplyItem:view');

  const load = useVendorStore((s) => s.load);
  const refresh = useVendorStore((s) => s.refresh);
  const error = useVendorStore((s) => s.error);
  const vendors = useVendorStore((s) => (s.loadedFor === businessId ? s.vendors : NO_VENDORS));
  const isLoading = useVendorStore((s) =>
    businessId && canRead ? s.isLoading || s.loadedFor !== businessId : false
  );

  useEffect(() => {
    if (canRead) void load(businessId);
  }, [businessId, canRead, load]);

  /** The ones an item can be given to, or an order placed with. */
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.isActive), [vendors]);

  return { vendors, activeVendors, isLoading, error, refresh };
}
