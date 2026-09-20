import axios from 'axios';
import i18n from '@/i18n';

// Must stay a `process.env.X` member expression: Babel inlines EXPO_PUBLIC_* at build
// time by matching that exact shape. The cast is only because React Native's ambient
// types declare NODE_ENV alone on process.env.
const API_BASE_URL =
  (process.env as { EXPO_PUBLIC_API_URL?: string }).EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api';

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
    const data = err.response?.data as { message?: string; errors?: string[] } | undefined;
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
