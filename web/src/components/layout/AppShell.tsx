import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCounterSync } from '@/hooks/useCounterSync';
import { useNotificationPolling } from '@/hooks/useNotifications';
import { useAuthStore } from '@/store/authStore';
import PageLoader from './PageLoader';
import ScreenBackground from './ScreenBackground';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import styles from './AppShell.module.css';

const SIDEBAR_ID = 'app-sidebar';

/** The signed-in frame: sidebar, top bar, and the page in between. */
export default function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The bell has no push to wake it yet; this keeps its count current.
  useNotificationPolling();
  // Bills taken offline are sent when the connection returns, whichever page is open.
  useCounterSync();
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Following a link in the drawer closes it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // While the drawer covers the page, the page underneath does not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <div className={styles.shell}>
      <ScreenBackground />
      <a href="#main" className={styles.skip}>
        {t('web.shell.skipToContent')}
      </a>
      <Sidebar id={SIDEBAR_ID} open={drawerOpen} onClose={closeDrawer} />
      <div className={styles.column}>
        <TopBar sidebarId={SIDEBAR_ID} sidebarOpen={drawerOpen} onOpenSidebar={() => setDrawerOpen(true)} />
        <main id="main" className={styles.main} tabIndex={-1}>
          {/* Each page is its own chunk; the shell stays put while one loads.
              Keyed on the business, so switching remounts the page: a half-typed
              form belongs to the business it was started in, as in the app,
              which remounts its navigator when the role changes. */}
          <Suspense key={activeBusinessId ?? 'none'} fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
