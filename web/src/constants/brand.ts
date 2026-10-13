/**
 * The product's name, read from the mobile app's one definition of it so the two
 * apps cannot spell it differently. See the Naming section of CLAUDE.md.
 *
 * Translations write `{{appName}}`, which i18next fills for every string (see
 * i18n/index.ts), so nothing else in the web app types the name either — except
 * index.html's `<title>` and theme colour, which render before any script runs.
 */
export { APP_NAME, APP_NAME_PARTS } from '@shared/constants/brand';
