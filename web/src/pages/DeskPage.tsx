import { useTranslation } from 'react-i18next';
import { IoFileTrayFullOutline } from 'react-icons/io5';
import { listDeskOrders } from '@/api/supply';
import SupplyOrderList from '@/components/supply/SupplyOrderList';
import type { SupplyOrderStatus } from '@/types/supply';

/** Carts never reach the desk, and a cancelled order is not work. */
const DESK_FILTERS: SupplyOrderStatus[] = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED'];

const fetchOrders = (businessId: string, status?: SupplyOrderStatus) => listDeskOrders(businessId, { status });

/**
 * The central order desk — requirement 3: one person sees every branch's
 * incoming supply orders. Oldest first, which the API decides: a queue read
 * newest-first starves the order that has waited longest, which is the one the
 * branch is on the phone about.
 */
export default function DeskPage() {
  const { t } = useTranslation();
  return (
    <SupplyOrderList
      title={t('supply.deskTitle')}
      subtitle={t('home.deskSubtitle')}
      emptyTitle={t('supply.deskEmpty')}
      emptyBody={t('supply.deskEmptyBody')}
      emptyIcon={IoFileTrayFullOutline}
      showBranch
      statusFilters={DESK_FILTERS}
      fetchOrders={fetchOrders}
    />
  );
}
