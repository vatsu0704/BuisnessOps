import { Linking } from 'react-native';
import { whatsAppUrl } from './whatsappNumber';

// The number and the link live in whatsappNumber.ts, which the web app shares.
export * from './whatsappNumber';

/**
 * Hand a message to WhatsApp, addressed to one number — how an order reaches a
 * third-party vendor, who does not use this app (requirement 25).
 *
 * Resolves false when nothing could open it, so the caller can say so.
 */
export async function openWhatsApp(phone: string, text: string): Promise<boolean> {
  const url = whatsAppUrl(phone, text);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
