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

/**
 * The words for a status, which differ for a vendor's order (requirement 25).
 *
 * A vendor's goods never pass through the warehouse, so two of the warehouse's
 * words would describe things that did not happen: ACCEPTED there means the
 * desk SENT the order on to the vendor, and DELIVERED means the branch RECEIVED
 * it — nobody of ours carried anything. Same status, its own sentence.
 */
export function supplyStatusKey(status: SupplyOrderStatus, fromVendor: boolean) {
  if (fromVendor && status === 'ACCEPTED') return 'supplyStatus.SENT_TO_VENDOR' as const;
  if (fromVendor && status === 'DELIVERED') return 'supplyStatus.RECEIVED' as const;
  return `supplyStatus.${status}` as const;
}

export function SupplyStatusPill({
  status,
  fromVendor = false,
}: {
  status: SupplyOrderStatus;
  fromVendor?: boolean;
}) {
  const { t } = useTranslation();
  return <Pill label={t(supplyStatusKey(status, fromVendor))} tone={STATUS_TONE[status]} />;
}

/**
 * The words for a payment state.
 *
 * Nothing paid yet reads as HOW it is going to be paid rather than as "pending"
 * — "Pay on delivery", "Accounts pays" — because nothing is outstanding: that
 * is simply how this order was always going to be settled. Settled by accounts
 * says so, since "Paid" alone would leave a FOCO cashier wondering who paid.
 */
export function supplyPaymentKey(status: SupplyPaymentStatus, mode: SupplyPaymentMode | null) {
  if (mode === 'ACCOUNTS') return status === 'VERIFIED' ? ('supply.paidByAccounts' as const) : ('supply.payAccounts' as const);
  if (mode === 'COD' && status === 'PENDING') return 'supply.payCod' as const;
  return `supplyPayment.${status}` as const;
}

export function SupplyPaymentPill({
  status,
  mode,
}: {
  status: SupplyPaymentStatus;
  mode: SupplyPaymentMode | null;
}) {
  const { t } = useTranslation();
  return <Pill label={t(supplyPaymentKey(status, mode))} tone={PAYMENT_TONE[status]} icon="card-outline" />;
}
