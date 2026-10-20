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
 * Its own names, not the mobile app's `kitnapay_token` and friends: the two run
 * on different origins and never read each other's storage, and the app's names
 * carry their own rename history (see `LEGACY_KEYS` in its `secureStorage.ts`).
 */
export const STORAGE_KEYS = {
  token: 'kitnapay_token',
  businessId: 'kitnapay_business_id',
  language: 'kitnapay_language',
  /** The last session the server confirmed, so the counter opens offline (requirement 30). */
  sessionCache: 'kitnapay_session_cache',
  /** This browser's receipt printer settings (requirement 31). */
  printer: 'kitnapay_printer',
} as const;

/**
 * Carry each key over from its `hisabkitab_*` name, once, at module load.
 *
 * This is not cosmetic: `token` and `sessionCache` are what let the counter open
 * with no connection, so renaming them without this would sign a shop out —
 * and, on a till that is offline at the time, sign it out of a session it cannot
 * get back until the internet returns.
 *
 * It runs here rather than in a store's init because the stores read these keys
 * while they are being created. Removing the old key after copying keeps a
 * browser from carrying two copies of a session around for good.
 *
 * Deletable once no browser that used the HisabKitab build is still in use.
 */
function carryLegacyKeys(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    const legacy = key.replace(/^kitnapay_/, 'hisabkitab_');
    try {
      if (window.localStorage.getItem(key) !== null) continue;
      const found = window.localStorage.getItem(legacy);
      if (found === null) continue;
      window.localStorage.setItem(key, found);
      window.localStorage.removeItem(legacy);
    } catch {
      // Private window or blocked site data: nothing to carry, nothing to fix.
      return;
    }
  }
}

carryLegacyKeys();
