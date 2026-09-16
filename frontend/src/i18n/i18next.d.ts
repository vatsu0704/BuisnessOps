import type en from './locales/en.json';

// Makes t() keys autocomplete and turns a typo or a key missing from en.json
// into a compile error rather than a string that silently renders as the key.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
    returnNull: false;
  }
}
