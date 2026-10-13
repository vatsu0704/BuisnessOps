import { useEffect } from 'react';
import { restoreLanguage } from '@/i18n';
import AppRoutes from '@/routes/AppRoutes';
import { useAuthStore } from '@/store/authStore';

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  const accountLocale = useAuthStore((s) => s.user?.preferredLocale);

  // Is there a stored session, and is it still good?
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // A choice made in this browser wins; otherwise the account's language, once
  // the session is known.
  useEffect(() => {
    void restoreLanguage(accountLocale);
  }, [accountLocale]);

  // Coming back to the tab re-reads the session, as the app does on returning
  // to the foreground: a role changed or access revoked meanwhile decides what
  // this person may now see.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && useAuthStore.getState().token) void refreshSession();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshSession]);

  return <AppRoutes />;
}
