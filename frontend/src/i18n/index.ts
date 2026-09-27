import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import type { Locale } from '@/types/user';
import { getItem, setItem } from '@/utils/secureStorage';
import en from './locales/en.json';
import gu from './locales/gu.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';

const LANGUAGE_KEY = 'biziq_language';

// Adding a language means adding a JSON file and one row here — no code changes
// anywhere else in the app.
export const LANGUAGES = [
  { code: 'en', locale: 'EN', label: 'English', short: 'EN' },
  { code: 'hi', locale: 'HI', label: 'हिन्दी', short: 'हिं' },
  { code: 'gu', locale: 'GU', label: 'ગુજરાતી', short: 'ગુજ' },
  { code: 'mr', locale: 'MR', label: 'मराठी', short: 'मरा' },
] as const satisfies readonly { code: string; locale: Locale; label: string; short: string }[];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export function isLanguageCode(value: string | null | undefined): value is LanguageCode {
  return !!value && LANGUAGES.some((l) => l.code === value);
}

export function localeToCode(locale: Locale | null | undefined): LanguageCode {
  return LANGUAGES.find((l) => l.locale === locale)?.code ?? 'en';
}

export function codeToLocale(code: LanguageCode): Locale {
  return LANGUAGES.find((l) => l.code === code)?.locale ?? 'EN';
}

export function deviceLanguage(): LanguageCode {
  const code = Localization.getLocales()[0]?.languageCode;
  return isLanguageCode(code) ? code : 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    gu: { translation: gu },
    mr: { translation: mr },
  },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  // React Native has no dependable Intl.PluralRules, so keep i18next's v3 plural
  // handling (`key` / `key_plural`) rather than the v4 format that requires it.
  compatibilityJSON: 'v3',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/**
 * Resolution order: an explicit choice the user made on this device, then the
 * language stored on their account, then the device language, then English.
 */
export async function restoreLanguage(accountLocale?: Locale | null): Promise<void> {
  const stored = await getItem(LANGUAGE_KEY);
  const next = isLanguageCode(stored) ? stored : accountLocale ? localeToCode(accountLocale) : deviceLanguage();
  if (i18n.language !== next) await i18n.changeLanguage(next);
}

export async function persistLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  await setItem(LANGUAGE_KEY, code);
}

/**
 * The language showing right now, as a code.
 *
 * `i18n.language` can carry a region ('en-IN') depending on how it was set, so
 * this narrows it to one of the four the app actually ships. Used when
 * registering a push token: the server needs to know which language to compose
 * a lock-screen notification in, and the lock screen is the one surface the app
 * cannot re-render afterwards.
 */
export function currentLanguage(): LanguageCode {
  const base = i18n.language?.split('-')[0];
  return isLanguageCode(base) ? base : 'en';
}

export default i18n;
