import { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useMembership } from '@/hooks/useBusinessId';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';

export default function RootNavigator() {
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  const membership = useMembership();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  /**
   * Re-read the session when the app comes back to the foreground.
   *
   * Role now decides which tabs and routes exist, and the role only ever
   * changed on bootstrap or login. Without this, demoting a cashier to staff
   * leaves them holding the cashier's app — tabs, buttons and all — until they
   * force-close it, and every request behind those buttons fails with a 403
   * that reads as the app being broken.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const cameToForeground = appState.current.match(/inactive|background/) && next === 'active';
      appState.current = next;
      if (cameToForeground && useAuthStore.getState().token) void refreshSession();
    });
    return () => subscription.remove();
  }, [refreshSession]);

  if (isBootstrapping) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!token || !user) return <AuthNavigator />;

  /**
   * Remount the whole stack when the role changes.
   *
   * One person can be ADMIN in one business and CASHIER in another — that is
   * exactly what requirement 16 makes normal. Switching business changes which
   * tabs and routes exist underneath a currently-focused tab that may be about
   * to unmount, and React Navigation does not enjoy having its screen list
   * change out from under a focused route.
   *
   * The cost is that in-flight form state is lost on a switch. That is arguably
   * right: those forms are business-scoped, and carrying a half-typed staff
   * record into another tenant is worse than losing it.
   */
  return <AppNavigator key={membership?.role ?? 'none'} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
