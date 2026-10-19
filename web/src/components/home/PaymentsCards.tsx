import { useTranslation } from 'react-i18next';
import { IoCardOutline, IoShieldCheckmarkOutline } from 'react-icons/io5';
import InfoCard from '@/components/ui/InfoCard';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useSupplyPayments } from '@/hooks/useSupplyPayments';
import { pathTo } from '@/routes/paths';
import { formatAmount } from '@/utils/format';

/**
 * Requirement 27 — what accounts has to pay for, the figure without opening the
 * page. The accountant's way in, and the owner's, who holds the same capability.
 */
export function PaymentsCard() {
  const { t } = useTranslation();
  const { ready, readyTotal, onTheWay, refresh } = useSupplyPayments();
  useRefreshOnFocus(refresh, { onMount: false });
  return (
    <InfoCard
      icon={IoCardOutline}
      title={t('home.paymentsTitle')}
      subtitle={
        ready.length > 0
          ? t('home.paymentsReady', { amount: formatAmount(readyTotal, ready[0].currency), count: ready.length })
          : onTheWay.length > 0
            ? t('home.paymentsOnTheWay', { count: onTheWay.length })
            : t('home.paymentsNone')
      }
      to={`${pathTo('payments')}?tab=pay`}
    />
  );
}

/**
 * Requirement 26 — payments sent to the warehouse that nobody has confirmed. The
 * desk's card; whoever also pays already has both lists behind the card above.
 */
export function PaymentsToConfirmCard() {
  const { t } = useTranslation();
  const { toConfirm, refresh } = useSupplyPayments();
  useRefreshOnFocus(refresh, { onMount: false });
  return (
    <InfoCard
      icon={IoShieldCheckmarkOutline}
      title={t('home.paymentsToConfirmTitle')}
      subtitle={
        toConfirm.length > 0
          ? t('home.paymentsToConfirmCount', { count: toConfirm.length })
          : t('home.paymentsToConfirmNone')
      }
      to={`${pathTo('payments')}?tab=confirm`}
    />
  );
}
