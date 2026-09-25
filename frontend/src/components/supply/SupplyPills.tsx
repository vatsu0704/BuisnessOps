import { useTranslation } from 'react-i18next';
import Pill, { type PillTone } from '@/components/Pill';
import type { SupplyPaymentMode, SupplyOrderStatus, SupplyPaymentStatus } from '@/types/supply';

/**
 * How an order's state reads at a glance.
 *
 * Two `Record`s over the full enums rather than a chain of conditionals, so
 * adding a status to the backend fails `tsc` here until someone decides what
 * colour it is — instead of rendering as an untinted default nobody notices.
 *
 * The label always carries the meaning; the tone only reinforces it. Colour on
 * its own would leave the payment state unreadable to anyone who cannot
 * separate the amber from the green.
 */

const STATUS_TONE: Record<SupplyOrderStatus, PillTone> = {
  DRAFT: 'muted',
  PLACED: 'brand',
  ACCEPTED: 'brand',
  PACKED: 'brand',
  DISPATCHED: 'warning',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

const PAYMENT_TONE: Record<SupplyPaymentStatus, PillTone> = {
  PENDING: 'muted',
  PAID: 'warning',
  VERIFIED: 'success',
  FAILED: 'danger',
};

export function SupplyStatusPill({ status }: { status: SupplyOrderStatus }) {
  const { t } = useTranslation();
  return <Pill label={t(`supplyStatus.${status}`)} tone={STATUS_TONE[status]} />;
}

export function SupplyPaymentPill({
  status,
  mode,
}: {
  status: SupplyPaymentStatus;
  mode: SupplyPaymentMode | null;
}) {
  const { t } = useTranslation();
  // COD before it arrives says "cash on delivery", not "pending": nothing is
  // outstanding, that is simply how this order was always going to be paid.
  const label =
    mode === 'COD' && status === 'PENDING' ? t('supply.payCod') : t(`supplyPayment.${status}`);
  return <Pill label={label} tone={PAYMENT_TONE[status]} icon="card-outline" />;
}
