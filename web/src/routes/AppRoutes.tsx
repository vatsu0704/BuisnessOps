import { Route, Routes } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoCompassOutline, IoPricetagsOutline, IoStorefrontOutline } from 'react-icons/io5';
import AppShell from '@/components/layout/AppShell';
import { ALL_NAV_ENTRIES } from '@/constants/navigation';
import ComingSoonPage from '@/pages/ComingSoonPage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import NoticePage from '@/pages/NoticePage';
import SignupPage from '@/pages/SignupPage';
import { GuestOnly, RequireAccess, RequireAuth } from './guards';

/**
 * Every address the web app answers.
 *
 * The sidebar's entries each get a route, guarded by the same gates that decide
 * whether the sidebar shows them — so typing an address cannot reach a page the
 * navigation would not have offered. Pages not yet ported render the "coming to
 * the web" placeholder.
 */
export default function AppRoutes() {
  const { t } = useTranslation();

  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />

          {ALL_NAV_ENTRIES.filter((entry) => !entry.built).map((entry) => (
            <Route
              key={entry.key}
              path={entry.path}
              element={
                <RequireAccess gates={entry.gates}>
                  <ComingSoonPage icon={entry.icon} title={t(entry.labelKey)} />
                </RequireAccess>
              }
            />
          ))}

          {/* Reached from Home's cards rather than the sidebar. */}
          <Route
            path="/branches/new"
            element={
              <RequireAccess gates={[{ capability: 'branch:create' }]}>
                <ComingSoonPage icon={IoStorefrontOutline} title={t('addBranch.title')} />
              </RequireAccess>
            }
          />
          <Route
            path="/branches/:branchId"
            element={
              <RequireAccess gates={[{ capability: 'branch:update' }]}>
                <ComingSoonPage icon={IoStorefrontOutline} title={t('branchSettings.title')} />
              </RequireAccess>
            }
          />
          <Route
            path="/products/new"
            element={
              <RequireAccess gates={[{ capability: 'product:manage' }]}>
                <ComingSoonPage icon={IoPricetagsOutline} title={t('addProduct.title')} />
              </RequireAccess>
            }
          />
          <Route
            path="/products/:productId/edit"
            element={
              <RequireAccess gates={[{ capability: 'product:manage' }]}>
                <ComingSoonPage icon={IoPricetagsOutline} title={t('editProduct.title')} />
              </RequireAccess>
            }
          />

          <Route
            path="*"
            element={<NoticePage icon={IoCompassOutline} title={t('web.notFound.title')} body={t('web.notFound.body')} />}
          />
        </Route>
      </Route>
    </Routes>
  );
}
