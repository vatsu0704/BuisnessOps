// Pure: shared with the web app (web/ reads it through @shared), so it may import
// nothing but relative paths. Opening the link on a phone stays in whatsapp.ts.

/**
 * The number a vendor's WhatsApp is addressed by — how an order reaches a
 * third-party vendor, who does not use this app (requirement 25).
 *
 * A ten-digit number is taken as an Indian mobile and given its country code —
 * that is how a vendor's number is written on a shop counter in this product's
 * market, and wa.me needs the code to find the account. Anything longer is
 * used as typed, digits only. Anything shorter is not a number to send to.
 */
export function whatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.length > 10 ? digits : null;
}

/**
 * `https://wa.me/<number>?text=` rather than the `whatsapp://` scheme: the
 * https link opens WhatsApp when it is installed and its web page when it is
 * not, so it never silently does nothing. The text is composed by the caller,
 * in the sender's language. Null when the phone is not a number to send to.
 */
export function whatsAppUrl(phone: string, text: string): string | null {
  const number = whatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
