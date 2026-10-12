import { Linking } from 'react-native';
import { API_BASE_URL } from '@/api/client';

/**
 * The public privacy policy and account-deletion pages.
 *
 * They are served by the same server as the API, at its root rather than under
 * `/api` (backend `routes/legal.routes.js`), so their address is derived from
 * `EXPO_PUBLIC_API_URL` instead of being a second build-time variable that could
 * be set to a different host by mistake. Wherever the API moves, these move
 * with it.
 */
const SERVER_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export type LegalPage = 'privacy' | 'delete-account';

export function legalPageUrl(page: LegalPage): string {
  return `${SERVER_ORIGIN}/${page}`;
}

/**
 * Opened in the browser rather than inside the app: it is the same page the
 * store listing links to, and a person reading a privacy policy should be
 * reading the public copy, not a rendering of it.
 */
export function openLegalPage(page: LegalPage): void {
  void Linking.openURL(legalPageUrl(page)).catch(() => undefined);
}
