import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoCompassOutline } from 'react-icons/io5';
import AppShell from '@/components/layout/AppShell';
import FullPageLoader from '@/components/layout/FullPageLoader';
import ComingSoonPage from '@/pages/ComingSoonPage';
import NoticePage from '@/pages/NoticePage';
import { GuestOnly, RequireAccess, RequireAuth } from './guards';
import { PAGES } from './pages';
import { ROUTES, type RouteKey } from './paths';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));

const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

/**
 * Every address the web app answers: one route per entry in `routes/paths.ts`,
 * each guarded by the same rule the app opens that screen on, and each showing
 * its page from `routes/pages.ts` — or "coming to the web" until it is ported.
 */
export default function AppRoutes() {
  const { t } = useTranslation();

  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route
          path="/login"
          element={
            <Suspense fallback={<FullPageLoader />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route
          path="/signup"
          element={
            <Suspense fallback={<FullPageLoader />}>
              <SignupPage />
            </Suspense>
          }
        />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {ROUTE_KEYS.map((key) => {
            const { Page, titleKey, icon } = PAGES[key];
            const element = (
              <RequireAccess route={key}>
                {Page ? <Page /> : <ComingSoonPage icon={icon} title={t(titleKey)} />}
              </RequireAccess>
            );
            return key === 'home' ? (
              <Route key={key} index element={element} />
            ) : (
              <Route key={key} path={ROUTES[key].path} element={element} />
            );
          })}

          <Route
            path="*"
            element={<NoticePage icon={IoCompassOutline} title={t('web.notFound.title')} body={t('web.notFound.body')} />}
          />
        </Route>
      </Route>
    </Routes>
  );
}
