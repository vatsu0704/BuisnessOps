import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerDeviceToken, unregisterDeviceToken } from '@/api/notifications';
import { codeToLocale } from '@/i18n';
import type { LanguageCode } from '@/i18n';

/**
 * Registering this device for push — requirements 2 and 8.
 *
 * ## Why `getDevicePushTokenAsync` and not `getExpoPushTokenAsync`
 *
 * The Expo token routes through Expo's own relay, which means a third party in
 * the delivery path and an Expo project id this app does not need. The device
 * token is the **raw FCM token**, sent straight to Google by our own backend
 * using `firebase-admin`. Same library family, one fewer hop, and nothing to
 * configure beyond `google-services.json`.
 *
 * ## Everything here fails soft
 *
 * A denied permission, an emulator with no Google Play Services, a web build —
 * each returns `null` and the app carries on. Notifications are a convenience
 * layered on top of data that is already correct and already visible in the
 * notification centre; nothing should break because a phone will not take them.
 */

/**
 * What the OS does with a notification that arrives while the app is open.
 *
 * Shown rather than swallowed: the alternative is a person watching the screen
 * being the only one who is not told, which is the opposite of the point.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Android 8+ requires a channel before anything can be delivered, and one
 * created lazily on first notification gets the OS default name — "Misc" — in
 * the app's notification settings. Creating it up front, with a name, is what
 * makes the per-category switches in Android's own settings legible.
 *
 * The id must match `channelId` in `backend/src/notifications/push.js`.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('updates', {
    name: 'Updates',
    // HIGH is what makes it a **heads-up** notification: the banner that slides
    // over whatever is on screen. At DEFAULT it would arrive silently in the
    // shade, which is a notification nobody looks at until they were going to
    // open the app anyway.
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4F46E5',
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Ask for permission if it has not been answered, and return whether we have it.
 *
 * **Android only ever asks once.** After a denial the prompt never appears
 * again and the app cannot re-trigger it, which is why the Settings screen
 * tells the person to go to the OS rather than offering a button that would do
 * nothing.
 */
export async function hasPushPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Register this device with the server.
 *
 * Called on login and on every app start, because a token can be rotated by the
 * OS at any time and a stale one is a phone that has gone quiet for no visible
 * reason. Re-registering an unchanged token is a cheap upsert.
 *
 * Returns the token so the caller can hand it back at logout.
 */
export async function registerForPush(language: LanguageCode): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;

    // BEFORE the permission check, and deliberately so. Creating a channel
    // needs no permission, and on Android 8+ a notification naming a channel
    // that does not exist yet is **dropped without a trace** — so the channel
    // has to be in place before the first push can arrive, not as a
    // consequence of permission having already been granted.
    await ensureAndroidChannel();

    if (!(await hasPushPermission())) return null;

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (!token) return null;

    await registerDeviceToken({
      token,
      platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      // The DEVICE's language. Sent again whenever it changes, because the
      // lock screen is the one surface the app cannot re-render.
      locale: codeToLocale(language),
    });
    return token;
  } catch {
    // Swallowed on purpose: no Google Play Services, no network, a revoked
    // permission. None of them is a reason to interrupt somebody.
    return null;
  }
}

/**
 * This device's current push token, or null if it has none.
 *
 * Read from the OS rather than remembered in a store: the token outlives any
 * one session, and a logout has to be able to unregister a token that was
 * obtained before this app launch.
 */
export async function currentPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return null;
    const { data } = await Notifications.getDevicePushTokenAsync();
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Stop this device receiving notifications for the account signing out.
 *
 * The row is disabled rather than deleted server-side, so the same handset
 * signing back in is an update. Failing here must never block a logout — a
 * person pressing Log out has to end up logged out.
 */
export async function unregisterFromPush(token: string | null): Promise<void> {
  if (!token) return;
  try {
    await unregisterDeviceToken(token);
  } catch {
    // Ignored deliberately — see above.
  }
}
