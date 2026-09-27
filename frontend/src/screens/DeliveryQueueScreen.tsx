import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SupplyOrderList from '@/components/supply/SupplyOrderList';
import { listDeliveryOrders } from '@/api/supply';

/**
 * The run this agent is carrying — requirement 12.
 *
 * Their own assigned orders, plus anything dispatched to a branch they cover
 * that nobody was named on: a desk that dispatches without assigning would
 * otherwise produce orders no agent can see and no agent can close.
 *
 * No status filter. There is one status that matters on the road — dispatched —
 * and chips over a list of two are furniture.
 */
export default function DeliveryQueueScreen() {
  const { t } = useTranslation();

  const fetchOrders = useCallback((businessId: string) => listDeliveryOrders(businessId), []);

  return (
    <SupplyOrderList
      testIDPrefix="supply-deliveries"
      title={t('supply.deliveriesTitle')}
      subtitle={t('home.deliveriesSubtitle')}
      emptyTitle={t('supply.noDeliveries')}
      emptyBody={t('supply.noDeliveriesBody')}
      emptyIcon="bicycle-outline"
      showBranch
      fetchOrders={fetchOrders}
    />
  );
}
