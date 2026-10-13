import { API_BASE_URL } from '@/api/client';

/**
 * The public privacy policy and account-deletion pages, served by the API's own
 * server at its root rather than under /api — so their address is derived from
 * the API's, and wherever the API moves, these move with it.
 */
const SERVER_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export type LegalPage = 'privacy' | 'delete-account';

export function legalPageUrl(page: LegalPage): string {
  return `${SERVER_ORIGIN}/${page}`;
}
