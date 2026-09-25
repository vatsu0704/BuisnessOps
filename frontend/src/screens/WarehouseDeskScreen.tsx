import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SupplyOrderList from '@/components/supply/SupplyOrderList';
import { listDeskOrders } from '@/api/supply';
import type { SupplyOrderStatus } from '@/types/supply';

/**
 * The central order desk — requirement 3: "one person can see all the
 * branches' incoming supply orders".
 *
 * Oldest first, which the API decides: a queue read newest-first quietly
 * starves the order that has been waiting longest, which is the one the branch
 * is on the phone about.
 *
 * Carts never appear here; the server excludes them. A DRAFT is a branch
 * thinking out loud, and a queue where some rows are not real work is a queue
 * that stops being trusted.
 */
const DESK_FILTERS: SupplyOrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED'];

export default function WarehouseDeskScreen() {
  const { t } = useTranslation();

  const fetchOrders = useCallback(
    (businessId: string, status?: SupplyOrderStatus) => listDeskOrders(businessId, { status }),
    []
  );

  return (
    <SupplyOrderList
      testIDPrefix="supply-desk"
      title={t('supply.deskTitle')}
      subtitle={t('home.deskSubtitle')}
      emptyTitle={t('supply.deskEmpty')}
      emptyBody={t('supply.deskEmptyBody')}
      emptyIcon="file-tray-full-outline"
      showBranch
      statusFilters={DESK_FILTERS}
      fetchOrders={fetchOrders}
    />
  );
}
