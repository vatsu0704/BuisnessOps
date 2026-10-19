import { useTranslation } from 'react-i18next';
import { IoBicycleOutline } from 'react-icons/io5';
import { listDeliveryOrders } from '@/api/supply';
import SupplyOrderList from '@/components/supply/SupplyOrderList';

const fetchOrders = (businessId: string) => listDeliveryOrders(businessId);

/**
 * The run this agent is carrying — requirement 12. Their own assigned orders,
 * plus anything dispatched to a branch they cover that nobody was named on, so
 * a run the desk did not assign is still somebody's. No status chips: on the
 * road one status matters, and chips over a list of two are furniture.
 */
export default function DeliveriesPage() {
  const { t } = useTranslation();
  return (
    <SupplyOrderList
      title={t('supply.deliveriesTitle')}
      subtitle={t('home.deliveriesSubtitle')}
      emptyTitle={t('supply.noDeliveries')}
      emptyBody={t('supply.noDeliveriesBody')}
      emptyIcon={IoBicycleOutline}
      showBranch
      fetchOrders={fetchOrders}
    />
  );
}
