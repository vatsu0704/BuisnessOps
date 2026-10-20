import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no working implementation on web in this Expo SDK —
// calling it throws at runtime ("getValueWithKeyAsync is not a function").
// Native (iOS/Android) always uses the real, secure SecureStore; web falls
// back to localStorage, which is what the web platform actually offers.
const isWeb = Platform.OS === 'web';

/**
 * What each key was called before the KitnaPay rename, new name to old.
 *
 * The rename could not simply change the constants: these keys hold the session
 * token, the business the switcher last settled on and the chosen language, so
 * writing to new names and leaving the old ones would sign every installed
 * tester out and forget their language — a rename presenting as a bug.
 *
 * The carry-over lives here rather than as a one-shot migration on startup
 * because there is no single moment that is reliably early enough: `i18n`
 * reads the language key while its module is still evaluating, long before
 * `authStore.bootstrap` runs. Doing it inside `getItem` has no ordering to get
 * wrong — the first read of each key moves it, and every read after that finds
 * the new name and costs nothing extra.
 *
 * Deletable once no install predating the rename is left in the field.
 */
const LEGACY_KEYS: Record<string, string> = {
  kitnapay_token: 'biziq_token',
  kitnapay_business_id: 'biziq_business_id',
  kitnapay_language: 'biziq_language',
};

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      const found = window.localStorage.getItem(key);
      if (found !== null) return found;
      const legacy = LEGACY_KEYS[key];
      if (!legacy) return null;
      const carried = window.localStorage.getItem(legacy);
      if (carried === null) return null;
      window.localStorage.setItem(key, carried);
      window.localStorage.removeItem(legacy);
      return carried;
    } catch {
      return null;
    }
  }

  const found = await SecureStore.getItemAsync(key);
  if (found !== null) return found;

  const legacy = LEGACY_KEYS[key];
  if (!legacy) return null;
  // A failed carry-over must read as "nothing stored", never throw: the worst
  // case is one sign-in, and an exception here would stop the app booting.
  try {
    const carried = await SecureStore.getItemAsync(legacy);
    if (carried === null) return null;
    await SecureStore.setItemAsync(key, carried);
    await SecureStore.deleteItemAsync(legacy);
    return carried;
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private browsing / storage disabled — silently no-op, same as a
      // failed write would on native.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
