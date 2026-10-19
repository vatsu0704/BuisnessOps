import { useTranslation } from 'react-i18next';
import { IoCardOutline } from 'react-icons/io5';
import {
  SUPPLY_PAYMENT_TONE,
  SUPPLY_STATUS_TONE,
  supplyPaymentKey,
  supplyStatusKey,
} from '@shared/utils/supplyStatus';
import Pill from '@/components/ui/Pill';
import type { SupplyOrderStatus, SupplyPaymentMode, SupplyPaymentStatus } from '@/types/supply';

/**
 * How an order's state reads at a glance — the app's `SupplyPills`. The words and
 * the tones are shared (`utils/supplyStatus.ts`), so a status the backend adds
 * fails `tsc` in both apps until it has a colour.
 */
export function SupplyStatusPill({ status, fromVendor = false }: { status: SupplyOrderStatus; fromVendor?: boolean }) {
  const { t } = useTranslation();
  return <Pill label={t(supplyStatusKey(status, fromVendor))} tone={SUPPLY_STATUS_TONE[status]} />;
}

export function SupplyPaymentPill({ status, mode }: { status: SupplyPaymentStatus; mode: SupplyPaymentMode | null }) {
  const { t } = useTranslation();
  return <Pill label={t(supplyPaymentKey(status, mode))} tone={SUPPLY_PAYMENT_TONE[status]} icon={IoCardOutline} />;
}
