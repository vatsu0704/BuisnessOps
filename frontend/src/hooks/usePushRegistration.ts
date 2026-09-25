import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import { refreshNotifications } from '@/store/notificationStore';
import { useMembership } from '@/hooks/useBusinessId';
import { resolveDeepLink } from '@/navigation/routeAccess';
import { registerForPush } from '@/utils/push';
import { currentLanguage } from '@/i18n';
import type { NotificationDeepLink } from '@/types/notification';

/**
 * Registers this device and handles a notification being tapped.
 *
 * Mounted once, high in the tree, because both halves are global: a token is
 * the app's, not a screen's, and a tap can arrive while any screen is showing —
 * or while the app is not running at all.
 *
 * ## Why registration re-runs
 *
 * - **On login**, obviously.
 * - **On every foreground**, because the OS can rotate a push token at any
 *   time, and a stale one is a phone that has gone quiet for no visible reason.
 *   Re-registering an unchanged token is a cheap upsert server-side.
 * - **When the language changes**, because the lock screen is the one surface
 *   the app cannot re-render: the server has to have been told the new language
 *   before the next notification is composed.
 */
export function usePushRegistration() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const token = useAuthStore((s) => s.token);
  const membership = useMembership();

  // Held in a ref rather than state: nothing renders from it, and setting state
  // here would re-render the whole tree for a value no component reads.
  const membershipRef = useRef(membership);
  membershipRef.current = membership;

  useEffect(() => {
    if (!token) return undefined;

    void registerForPush(currentLanguage());

    // The OS may rotate the token while the app is backgrounded.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void registerForPush(currentLanguage());
        // Something may have arrived while we were away, and a notification
        // delivered to the OS does not tell the app about itself.
        void refreshNotifications();
      }
    });

    return () => subscription.remove();
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    /**
     * A tap, whether the app was running or was launched by it.
     *
     * `getLastNotificationResponseAsync` covers the cold-start case: the OS
     * hands the tap over before any listener exists, so without it a
     * notification that launched the app would open Home and lose where it was
     * pointing.
     */
    function handle(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as
        | { deepLink?: string }
        | undefined;
      if (!data?.deepLink) return;

      let link: NotificationDeepLink | null = null;
      try {
        // FCM data values are strings — the whole payload has to be, which is
        // why this is JSON rather than a nested object.
        link = JSON.parse(data.deepLink);
      } catch {
        return;
      }
      if (!link?.route) return;

      // Re-checked against what this person can open NOW. A notification
      // outlives the access that justified it, and dispatching into an
      // unregistered route is a silent no-op.
      const target = resolveDeepLink(membershipRef.current, link.route, link.params);
      navigation.navigate(target.route as 'Tabs', target.params as undefined);
      void refreshNotifications();
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handle);

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });

    // A notification arriving while the app is open should update the badge
    // without waiting for the next screen focus.
    const received = Notifications.addNotificationReceivedListener(() => {
      void refreshNotifications();
    });

    return () => {
      subscription.remove();
      received.remove();
    };
  }, [navigation, token]);
}
