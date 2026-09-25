import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import SupplyOrderList from '@/components/supply/SupplyOrderList';
import { listSupplyOrders } from '@/api/supply';
import type { SupplyOrderStatus } from '@/types/supply';

/**
 * The cashier's tracking view — requirement 11.
 *
 * Includes the branch's open cart, which is a real part of "where are my
 * orders": an order half built and forgotten is exactly the thing this screen
 * should surface rather than hide. Tapping it opens the cart, not the detail.
 */
export default function SupplyOrdersScreen() {
  const { t } = useTranslation();

  const fetchOrders = useCallback(
    (businessId: string, status?: SupplyOrderStatus) => listSupplyOrders(businessId, { status }),
    []
  );

  return (
    <SupplyOrderList
      testIDPrefix="supply-orders"
      title={t('supply.ordersTitle')}
      emptyTitle={t('supply.noOrders')}
      emptyBody={t('supply.noOrdersBody')}
      emptyIcon="receipt-outline"
      fetchOrders={fetchOrders}
    />
  );
}
