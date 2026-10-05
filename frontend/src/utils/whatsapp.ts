import { Linking } from 'react-native';

/**
 * Hand a message to WhatsApp, addressed to one number — how an order reaches a
 * third-party vendor, who does not use this app (requirement 25).
 *
 * `https://wa.me/<number>?text=` rather than the `whatsapp://` scheme: the
 * https link opens WhatsApp when it is installed and its web page when it is
 * not, so it never silently does nothing. The text is composed on the device
 * by the caller, in the sender's language.
 *
 * A ten-digit number is taken as an Indian mobile and given its country code —
 * that is how a vendor's number is written on a shop counter in this product's
 * market, and wa.me needs the code to find the account. Anything longer is
 * used as typed, digits only.
 */
export function whatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.length > 10 ? digits : null;
}

/** Resolves false when nothing could open it, so the caller can say so. */
export async function openWhatsApp(phone: string, text: string): Promise<boolean> {
  const number = whatsAppNumber(phone);
  if (!number) return false;
  try {
    await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(text)}`);
    return true;
  } catch {
    return false;
  }
}
