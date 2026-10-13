import { Linking } from 'react-native';

// Everything but the opener lives in upiUri.ts, which the web app shares.
export * from './upiUri';

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
