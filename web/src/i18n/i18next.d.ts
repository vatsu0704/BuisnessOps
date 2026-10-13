import type en from '@shared/i18n/locales/en.json';
import type webEn from './locales/en.json';

// Types t() against the shared English file plus the web-only strings, so a
// typo or a missing key is a compile error rather than a raw key on screen.
// `npm run lint:i18n` covers what this cannot: hi/gu/mr having every web key.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en & { web: typeof webEn } };
    returnNull: false;
  }
}
