import axios from 'axios';
import i18n from '@/i18n';
import { translateApiError, type ApiErrorBody } from '@/api/errorMessages';

// Must stay a bare `process.env.EXPO_PUBLIC_X` member expression. Babel inlines the
// value at build time by matching that exact shape, so anything wrapped around
// `process.env` — a destructure, or an `as {...}` cast — compiles and type-checks
// cleanly but leaves a runtime lookup that is `undefined` in a release bundle. That
// hid here for a long time, because the fallback below is also the dev URL: over
// `adb reverse` a broken inline is indistinguishable from a working one, and only a
// release APK built against the hosted API showed it, as "cannot reach the BizIQ
// server at http://localhost:4000/api". No cast is needed to type it — @types/node
// declares process.env as a string dictionary.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // Without this a request to an unreachable host hangs on the OS-level TCP
  // timeout (over a minute on Android) with the button stuck in its loading
  // state, which reads as a frozen app rather than as a failure.
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Sign-in, sign-up and session restore are the first requests the app makes, and
// a hosted free-tier server may be asleep when they land — waking one measured
// at ~32s. 15s stays right for everything after that, so only the calls that can
// hit a cold server wait longer, rather than making every failure slow.
export const AUTH_TIMEOUT_MS = 45000;

// Fired when the app opens signed out, so the server starts waking while the
// person is still typing their email instead of when they press Sign in.
// Deliberately fire-and-forget: nothing renders from it, and the real request
// behind it reports its own failure.
export function warmUpServer(): Promise<void> {
  return apiClient
    .get('/health', { timeout: AUTH_TIMEOUT_MS })
    .then(() => undefined)
    .catch(() => undefined);
}

// True when the request never got an answer at all — offline, wrong base URL,
// or a server that is down or still waking. Worth telling apart from a reply
// the API actually sent, because a stored token is only proven invalid when
// the API says so, never by a connection that failed.
export function isTransportFailure(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

// Called by authStore on bootstrap/login/signup/logout so every request
// after that carries (or stops carrying) the bearer token — screens never
// touch headers directly.
export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorBody | undefined;

    // The API sends a machine code; the wording lives in the locale files, so
    // it comes out in the language this device is set to. Before this, every
    // API failure reached the screen as the server's hardcoded English no
    // matter which of the four languages the app was running in.
    const translated = translateApiError(data);
    if (translated) return translated;

    // No translation for this code in this build — which is what happens when
    // the server is newer than the app. The server's own English is still a
    // specific, true sentence, and beats a generic failure.
    if (data?.errors?.length) return data.errors.join('\n');
    if (data?.message) return data.message;

    // No response at all means the request never reached the API — the device
    // is off the network, the base URL points somewhere unreachable, or the
    // server is down. Reporting that as a generic failure sends people hunting
    // for a wrong password when the real fix is a connection, so name it.
    if (!err.response) {
      return i18n.t('errors.unreachable', { url: API_BASE_URL });
    }
  }
  return i18n.t('errors.unexpected');
}
