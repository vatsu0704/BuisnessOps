import axios from 'axios';
import i18n from '@/i18n';
import { translateApiError, type ApiErrorBody } from '@/api/errorMessages';

/**
 * Where the API lives. Vite inlines `import.meta.env.VITE_*` at build time, so a
 * production build calls whatever was in `.env` when it was built — the same
 * trap as the mobile app's EXPO_PUBLIC_API_URL. Set it before `npm run build`.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // An unreachable host otherwise hangs on the browser's own timeout with the
  // button stuck in its loading state.
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Sign-in, sign-up and session restore can land on a hosted server that is still
 * waking up (~32s measured), so only those wait this long.
 */
export const AUTH_TIMEOUT_MS = 45000;

/** Fired when the app opens signed out, so the server wakes while the person types. */
export function warmUpServer(): Promise<void> {
  return apiClient
    .get('/health', { timeout: AUTH_TIMEOUT_MS })
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * True when the request never got an answer — offline, wrong base URL, or a
 * server that is down. A stored token is only proven invalid by a reply from the
 * API, never by a connection that failed.
 */
export function isTransportFailure(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

/** Called by authStore so every request after sign-in carries the bearer token. */
export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

/**
 * The codes that mean **this session is over**, as opposed to this request being
 * refused. `AUTH_CREDENTIALS_INVALID` is also a 401 (a mistyped password), and
 * `PERMISSION_DENIED` / `TENANT_ACCESS_DENIED` are 403s about one action — none
 * of those may sign anybody out.
 */
const SESSION_ENDED_CODES = new Set(['AUTH_TOKEN_INVALID', 'AUTH_HEADER_MISSING', 'AUTH_ACCOUNT_DISABLED']);

/** Registered by authStore rather than imported from it, which would be a cycle. */
let onSessionEnded: (() => void) | null = null;

export function setSessionEndedHandler(handler: (() => void) | null) {
  onSessionEnded = handler;
}

/**
 * A token lasts seven days and a browser tab can stay open longer than that, so
 * a session ending underneath someone is certain, not an edge case. The error is
 * still rejected, so each caller's own catch reports it as before.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const code = (error.response?.data as ApiErrorBody | undefined)?.code;
      const hadToken = !!apiClient.defaults.headers.common.Authorization;
      if (hadToken && (status === 401 || status === 403) && code && SESSION_ENDED_CODES.has(code)) {
        onSessionEnded?.();
      }
    }
    return Promise.reject(error);
  }
);

/** A failure as a sentence in the reader's language. */
export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorBody | undefined;

    const translated = translateApiError(data);
    if (translated) return translated;

    // A code this build has no wording for: the server's own English is still a
    // specific, true sentence, and beats a generic failure.
    if (data?.errors?.length) return data.errors.join('\n');
    if (data?.message) return data.message;

    // No response at all: the request never reached the API. Say so, or people
    // go hunting for a wrong password when the fix is a connection.
    if (!err.response) return i18n.t('errors.unreachable', { url: API_BASE_URL });
  }
  return i18n.t('errors.unexpected');
}
