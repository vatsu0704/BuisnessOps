// Pure: shared with the web app (web/ reads it through @shared), so it may import
// nothing but relative paths. Each app draws the pill with its own component.
import type { SupplyOrderStatus, SupplyPaymentMode, SupplyPaymentStatus } from '../types/supply';

/** The tones both apps' `Pill` takes. */
export type SupplyTone = 'brand' | 'muted' | 'success' | 'warning' | 'danger';

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
export const SUPPLY_STATUS_TONE: Record<SupplyOrderStatus, SupplyTone> = {
  DRAFT: 'muted',
  PLACED: 'brand',
  ACCEPTED: 'brand',
  PACKED: 'brand',
  DISPATCHED: 'warning',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

export const SUPPLY_PAYMENT_TONE: Record<SupplyPaymentStatus, SupplyTone> = {
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
