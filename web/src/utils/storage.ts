/**
 * The browser's localStorage, wrapped so a private window or blocked site data
 * reads as "nothing stored" rather than throwing — the same contract as the
 * mobile app's `secureStorage` on web.
 *
 * Synchronous, unlike the app's, because localStorage is; nothing here has to
 * wait on a keychain.
 */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage disabled — the session simply will not survive a reload.
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

/**
 * The keys this app stores under.
 *
 * New names, not the app's `biziq_*` ones: those keep the old product name only
 * because renaming them would sign out every installed copy. The web app has no
 * installed copies to sign out, so it starts with the current name.
 */
export const STORAGE_KEYS = {
  token: 'hisabkitab_token',
  businessId: 'hisabkitab_business_id',
  language: 'hisabkitab_language',
} as const;
