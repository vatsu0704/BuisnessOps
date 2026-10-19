import { useTranslation } from 'react-i18next';
import Pill from '@/components/Pill';
import type { SupplyPaymentMode, SupplyOrderStatus, SupplyPaymentStatus } from '@/types/supply';
import {
  SUPPLY_PAYMENT_TONE,
  SUPPLY_STATUS_TONE,
  supplyPaymentKey,
  supplyStatusKey,
} from '@/utils/supplyStatus';

/**
 * How an order's state reads at a glance. The words and tones are shared with
 * the web app (`utils/supplyStatus.ts`); this only draws them.
 */

export function SupplyStatusPill({
  status,
  fromVendor = false,
}: {
  status: SupplyOrderStatus;
  fromVendor?: boolean;
}) {
  const { t } = useTranslation();
  return <Pill label={t(supplyStatusKey(status, fromVendor))} tone={SUPPLY_STATUS_TONE[status]} />;
}

export function SupplyPaymentPill({
  status,
  mode,
}: {
  status: SupplyPaymentStatus;
  mode: SupplyPaymentMode | null;
}) {
  const { t } = useTranslation();
  return <Pill label={t(supplyPaymentKey(status, mode))} tone={SUPPLY_PAYMENT_TONE[status]} icon="card-outline" />;
}
