import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoLockClosedOutline } from 'react-icons/io5';
import FullPageLoader from '@/components/layout/FullPageLoader';
import { useMembership } from '@/hooks/useBusinessId';
import NoticePage from '@/pages/NoticePage';
import { useAuthStore } from '@/store/authStore';
import { canOpenRoute, type RouteKey } from './paths';

type FromState = { from?: { pathname: string; search?: string } } | null;

/**
 * Signed in, or sent to sign in — remembering where they were headed, so the
 * link they followed still works after they have signed in.
 */
export function RequireAuth() {
  const location = useLocation();
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  if (isBootstrapping) return <FullPageLoader />;
  if (!token || !user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Sign-in and sign-up are for the signed out; anyone else goes where they were headed. */
export function GuestOnly() {
  const location = useLocation();
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  if (isBootstrapping) return <FullPageLoader />;
  if (token && user) {
    const from = (location.state as FromState)?.from;
    return <Navigate to={from ? `${from.pathname}${from.search ?? ''}` : '/'} replace />;
  }
  return <Outlet />;
}

/**
 * A page this role may open, by the same rule the app opens the screen on. Anyone
 * else is told it is not part of their role, rather than shown a page whose every
 * request would be refused. The server refuses them anyway; this says why.
 */
export function RequireAccess({ route, children }: { route: RouteKey; children: ReactNode }) {
  const { t } = useTranslation();
  const membership = useMembership();
  if (!canOpenRoute(membership, route)) {
    return <NoticePage icon={IoLockClosedOutline} title={t('web.noAccess.title')} body={t('web.noAccess.body')} />;
  }
  return <>{children}</>;
}
