import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { APP_NAME } from '@/constants/brand';
import type { Locale } from '@/types/user';
import { storage, STORAGE_KEYS } from '@/utils/storage';
// Every sentence the mobile app has is read from its own files: the web app
// reuses them rather than keeping a second copy that could drift. English ships
// in the main bundle as the fallback; the others load when chosen.
import en from '@shared/i18n/locales/en.json';
// The few sentences only the web app needs, merged in under `web.*`.
import webEn from './locales/en.json';

// Adding a language means a JSON file in each locales folder, one row here, and
// one loader in BUNDLES.
export const LANGUAGES = [
  { code: 'en', locale: 'EN', label: 'English', short: 'EN' },
  { code: 'hi', locale: 'HI', label: 'हिन्दी', short: 'हिं' },
  { code: 'gu', locale: 'GU', label: 'ગુજરાતી', short: 'ગુજ' },
  { code: 'mr', locale: 'MR', label: 'मराठी', short: 'मरा' },
] as const satisfies readonly { code: string; locale: Locale; label: string; short: string }[];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/**
 * Each language as one resource bundle: the app's strings plus the web's.
 *
 * Only English is in the main bundle. The other three are about 130 KB each and
 * a visitor reads one language, so each is its own chunk, fetched the first time
 * it is needed.
 */
const BUNDLES: Record<LanguageCode, () => Promise<object>> = {
  en: async () => ({ ...en, web: webEn }),
  hi: async () => {
    const [app, web] = await Promise.all([import('@shared/i18n/locales/hi.json'), import('./locales/hi.json')]);
    return { ...app.default, web: web.default };
  },
  gu: async () => {
    const [app, web] = await Promise.all([import('@shared/i18n/locales/gu.json'), import('./locales/gu.json')]);
    return { ...app.default, web: web.default };
  },
  mr: async () => {
    const [app, web] = await Promise.all([import('@shared/i18n/locales/mr.json'), import('./locales/mr.json')]);
    return { ...app.default, web: web.default };
  },
};

export function isLanguageCode(value: string | null | undefined): value is LanguageCode {
  return !!value && LANGUAGES.some((l) => l.code === value);
}

export function localeToCode(locale: Locale | null | undefined): LanguageCode {
  return LANGUAGES.find((l) => l.locale === locale)?.code ?? 'en';
}

export function codeToLocale(code: LanguageCode): Locale {
  return LANGUAGES.find((l) => l.code === code)?.locale ?? 'EN';
}

/** The first of the browser's preferred languages the app ships, else English. */
export function browserLanguage(): LanguageCode {
  const preferred = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const tag of preferred) {
    const base = tag?.split('-')[0];
    if (isLanguageCode(base)) return base;
  }
  return 'en';
}

/** Switch language, fetching its strings first if this is the first time. */
async function setLanguage(code: LanguageCode): Promise<void> {
  if (!i18n.hasResourceBundle(code, 'translation')) {
    i18n.addResourceBundle(code, 'translation', await BUNDLES[code](), true, true);
  }
  if (i18n.language !== code) await i18n.changeLanguage(code);
}

// Screen readers and the browser's font fallback both read <html lang>.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng.split('-')[0];
});

/**
 * Resolves once the first language is ready. main.tsx waits on it, so a Hindi
 * reader's first frame is in Hindi rather than flashing English.
 */
export const i18nReady: Promise<void> = (async () => {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: await BUNDLES.en() } },
    lng: 'en',
    fallbackLng: 'en',
    // The shared locale files are written for React Native, which has no
    // dependable Intl.PluralRules, so their plurals are `key` / `key_plural`.
    compatibilityJSON: 'v3',
    // {{appName}} is filled here for every string — see constants/brand.ts.
    interpolation: { escapeValue: false, defaultVariables: { appName: APP_NAME } },
    returnNull: false,
  });
  document.documentElement.lang = 'en';

  const stored = storage.get(STORAGE_KEYS.language);
  const initial = isLanguageCode(stored) ? stored : browserLanguage();
  // A chunk that fails to load leaves the page in English rather than blank.
  await setLanguage(initial).catch(() => undefined);
})();

/**
 * Resolution order, as in the app: an explicit choice made in this browser, then
 * the language on the account, then the browser's language, then English.
 */
export async function restoreLanguage(accountLocale?: Locale | null): Promise<void> {
  const choice = storage.get(STORAGE_KEYS.language);
  const next = isLanguageCode(choice) ? choice : accountLocale ? localeToCode(accountLocale) : browserLanguage();
  await setLanguage(next);
}

/** A choice made here: remembered in this browser, ahead of the account's language. */
export async function persistLanguage(code: LanguageCode): Promise<void> {
  await setLanguage(code);
  storage.set(STORAGE_KEYS.language, code);
}

export default i18n;
