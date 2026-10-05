import { useCallback, useEffect, useMemo } from 'react';
import { useSupplyPaymentStore } from '@/store/supplyPaymentStore';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { hasCapability } from '@/utils/permissions';
import type { SupplyPaymentOrder } from '@/types/supply';

const NONE: SupplyPaymentOrder[] = [];

/**
 * What accounts has to pay, and what is waiting to be confirmed — whichever of
 * the two this person may read (`supplyPayment:settle` for the first,
 * `supplyPayment:verify` for the second).
 *
 * "Due" splits into what can be paid now — delivered — and what is still on
 * its way. Both are shown, because Vatsal's rule is that accounts SEES an order
 * the moment it is placed and PAYS for it once it has arrived; the server
 * refuses the second kind regardless.
 */
export function useSupplyPayments() {
  const businessId = useBusinessId();
  const membership = useMembership();
  const canSettle = hasCapability(membership, 'supplyPayment:settle');
  const canVerify = hasCapability(membership, 'supplyPayment:verify');

  const load = useSupplyPaymentStore((s) => s.load);
  const error = useSupplyPaymentStore((s) => s.error);
  const due = useSupplyPaymentStore((s) => (s.loadedFor === businessId ? s.due : NONE));
  const toConfirm = useSupplyPaymentStore((s) => (s.loadedFor === businessId ? s.toConfirm : NONE));
  const isLoading = useSupplyPaymentStore((s) =>
    businessId && (canSettle || canVerify) ? s.isLoading || s.loadedFor !== businessId : false
  );

  const refresh = useCallback(
    () => load(businessId, { due: canSettle, toConfirm: canVerify }),
    [businessId, canSettle, canVerify, load]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ready = useMemo(() => due.filter((order) => order.status === 'DELIVERED'), [due]);
  const onTheWay = useMemo(() => due.filter((order) => order.status !== 'DELIVERED'), [due]);
  const readyTotal = useMemo(() => ready.reduce((sum, order) => sum + Number(order.totalAmount), 0), [ready]);

  return {
    canSettle,
    canVerify,
    due,
    ready,
    onTheWay,
    readyTotal,
    toConfirm,
    isLoading,
    error,
    refresh,
  };
}
