import { useEffect, useMemo } from 'react';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useVendorStore } from '@/store/vendorStore';
import type { Vendor } from '@/types/supply';
import { hasCapability } from '@/utils/permissions';

const NO_VENDORS: Vendor[] = [];

/**
 * The business's vendors, for anyone who can see the raw-material catalog —
 * the capability the list is guarded by. Anyone else gets an empty list rather
 * than a request that would 403.
 */
export function useVendors() {
  const businessId = useBusinessId();
  const canRead = hasCapability(useMembership(), 'supplyItem:view');

  const load = useVendorStore((s) => s.load);
  const refresh = useVendorStore((s) => s.refresh);
  const error = useVendorStore((s) => s.error);
  const vendors = useVendorStore((s) => (s.loadedFor === businessId ? s.vendors : NO_VENDORS));
  const isLoading = useVendorStore((s) =>
    businessId && canRead ? s.isLoading || (s.loadedFor !== businessId && !s.error) : false
  );

  useEffect(() => {
    if (canRead) void load(businessId);
  }, [businessId, canRead, load]);

  /** The ones an item can be given to. */
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.isActive), [vendors]);

  return { vendors, activeVendors, isLoading, error, refresh };
}
