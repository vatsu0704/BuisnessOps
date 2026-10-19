import { useTranslation } from 'react-i18next';
import { IoReceiptOutline } from 'react-icons/io5';
import { listSupplyOrders } from '@/api/supply';
import SupplyOrderList from '@/components/supply/SupplyOrderList';
import type { SupplyOrderStatus } from '@/types/supply';

const fetchOrders = (businessId: string, status?: SupplyOrderStatus) => listSupplyOrders(businessId, { status });

/**
 * The branch's tracking view — requirement 11, the app's Supply orders screen.
 *
 * Includes the branch's open cart, which is a real part of "where are my
 * orders": an order half built and forgotten is exactly what this page should
 * surface. Clicking it opens the cart, not the order page.
 */
export default function SupplyOrdersPage() {
  const { t } = useTranslation();
  return (
    <SupplyOrderList
      title={t('supply.ordersTitle')}
      emptyTitle={t('supply.noOrders')}
      emptyBody={t('supply.noOrdersBody')}
      emptyIcon={IoReceiptOutline}
      fetchOrders={fetchOrders}
    />
  );
}
