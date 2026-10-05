import { Linking } from 'react-native';
import type {
  SupplyOrder,
  SupplyOrderBusiness,
  SupplyOrderVendor,
  SupplyPaymentOrder,
} from '@/types/supply';

/**
 * Paying by UPI QR — requirement 26.
 *
 * No gateway and no money through this app: the payer scans a QR built from the
 * payee's UPI ID (or opens their own UPI app on it), pays there, and taps
 * "Payment done" here. The QR carries the exact amount and the order numbers,
 * so the payer types nothing and the receiver sees "₹2,400 · RR #214" in their
 * own UPI app — which is what made the typed reference unnecessary.
 *
 * The QR is generated from the UPI ID rather than stored as an uploaded image:
 * an image needs file storage the hosted server does not keep, and could not
 * carry the amount of a particular order anyway.
 */

/** Who a payment goes to, as the QR and the screens need it. */
export interface UpiPayee {
  /** What the payer's UPI app shows as "paying to". */
  name: string;
  /** null when accounts has not set one up yet, which means there is no QR. */
  upiId: string | null;
  /** Whether this is the warehouse or a vendor — the screens word them differently. */
  kind: 'WAREHOUSE' | 'VENDOR';
}

/**
 * The same shape the server accepts — see `isValidUpiId` in
 * backend/src/validations/shared.js. Checked here too so the Payment QR screen
 * can say "that is not a UPI ID" before a request is made.
 */
const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function isValidUpiId(value: string): boolean {
  return UPI_ID_RE.test(value.trim());
}

/** UPI moves rupees only. Any other currency has no QR to offer. */
export function isUpiCurrency(currency: string): boolean {
  return currency === 'INR';
}

/** Payment apps cut the note short; this keeps the order numbers, not the overflow. */
const NOTE_MAX = 50;

/**
 * The `upi://pay` link the QR encodes and "Pay with UPI app" opens.
 *
 * The parameters are NPCI's: `pa` the payee address, `pn` the name, `am` the
 * amount to two decimals, `cu` the currency, `tn` the note. Each value is
 * URL-encoded — a payee name may well be in Gujarati — except the `@` in the
 * address, which some UPI apps do not decode back and then refuse.
 */
export function buildUpiUri({
  upiId,
  name,
  amount,
  note,
}: {
  upiId: string;
  name: string;
  /**
   * Omitted only for the set-up screen's preview, which is scanned to check the
   * NAME a UPI app shows, not to pay — a code with no amount asks the payer to
   * type one, so nobody pays a test code by accident.
   */
  amount?: number;
  note?: string;
}): string {
  const params: [string, string][] = [
    ['pa', upiId.trim()],
    ['pn', name.trim()],
  ];
  if (amount !== undefined) params.push(['am', amount.toFixed(2)]);
  params.push(['cu', 'INR']);
  const trimmedNote = note?.trim().slice(0, NOTE_MAX);
  if (trimmedNote) params.push(['tn', trimmedNote]);

  return `upi://pay?${params
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%40/g, '@')}`)
    .join('&')}`;
}

/**
 * The note a payment for these orders carries: the branch code and the order
 * numbers, which is what the receiver looks for in their UPI app. Numbers, not
 * words, so it reads the same whichever language either phone is in.
 */
export function upiNote(branchCode: string | null | undefined, orderNumbers: (number | null)[]): string {
  const numbers = orderNumbers.filter((n): n is number => n !== null).map((n) => `#${n}`);
  return [branchCode ?? '', ...numbers].filter(Boolean).join(' ');
}

/**
 * Who this order's money goes to: its vendor, or the business's warehouse UPI.
 * Both travel with every order, so this needs no request.
 */
export function payeeOf(order: SupplyOrder | SupplyPaymentOrder): UpiPayee {
  return supplierPayee(order.vendor, order.business);
}

/**
 * The payee for a supplier: the vendor if there is one, the business's
 * warehouse UPI otherwise. The cart uses this per group of lines, before there
 * is an order to ask.
 */
export function supplierPayee(
  vendor: SupplyOrderVendor | null | undefined,
  business: SupplyOrderBusiness | null | undefined
): UpiPayee {
  if (vendor) {
    return { kind: 'VENDOR', name: vendor.upiName || vendor.name, upiId: vendor.upiId };
  }
  return {
    kind: 'WAREHOUSE',
    name: business?.supplyUpiName || business?.name || '',
    upiId: business?.supplyUpiId ?? null,
  };
}

/**
 * Open the phone's own UPI app on this payment — GPay, PhonePe, Paytm or a
 * bank's — with the amount filled in.
 *
 * This is the way to pay from the SAME phone the app is on, which cannot scan
 * its own screen. `Linking.openURL` hands the link to whichever app handles
 * `upi://`, and rejects when none does; that rejection is turned into `false`
 * so the caller can say "no UPI app found" rather than failing silently.
 * `canOpenURL` is deliberately not asked first: on Android 11+ it answers false
 * unless the scheme is declared in the manifest, even when an app is installed.
 */
export async function openUpiApp(uri: string): Promise<boolean> {
  try {
    await Linking.openURL(uri);
    return true;
  } catch {
    return false;
  }
}
