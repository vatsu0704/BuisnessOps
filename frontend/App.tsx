import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AnimatedSplash from '@/components/AnimatedSplash';
import { restoreLanguage } from '@/i18n';
import RootNavigator from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';

// keep the native splash up until the animated one has mounted over it
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const accountLocale = useAuthStore((s) => s.user?.preferredLocale);

  // A choice made on this device wins; otherwise fall back to the account's
  // language once the session is restored.
  useEffect(() => {
    void restoreLanguage(accountLocale);
  }, [accountLocale]);

  return (
    <SafeAreaProvider>
      <NavigationContainer
        /**
         * Routes are registered per role now, so a navigate() to one this
         * person cannot open reaches no navigator. React Navigation's default
         * for that is a red box in development and **silence** in production —
         * a button that does nothing, which nobody thinks to report.
         *
         * Logging it at least puts it somewhere findable. Screens should not
         * rely on this: the call site belongs inside something the same
         * capability already gated, and routeAccess.resolveDeepLink is what
         * catches the one case that genuinely arrives from outside — a push
         * notification for a screen the recipient has since lost.
         */
        onUnhandledAction={(action) => {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn(
              `[navigation] "${action.type}" reached no navigator — ` +
                `the target route is probably not registered for this role. ` +
                `Payload: ${JSON.stringify('payload' in action ? action.payload : {})}`
            );
          }
        }}
      >
        <RootNavigator />
        <StatusBar style={splashDone ? 'auto' : 'light'} />
      </NavigationContainer>
      {splashDone ? null : <AnimatedSplash ready={!isBootstrapping} onFinish={() => setSplashDone(true)} />}
    </SafeAreaProvider>
  );
}
