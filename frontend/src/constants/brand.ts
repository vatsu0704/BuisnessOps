/**
 * The product's name — the one place the app writes it.
 *
 * Wordmarks render it through `Wordmark`, and translations write `{{appName}}`,
 * which i18next fills from `interpolation.defaultVariables` (see i18n/index.ts),
 * so no caller passes it and no locale file spells it. A brand name reads the
 * same in every language, so it is not a translation key; never type it into a
 * component or a locale file.
 *
 * It is kept as its two words because the wordmark colours them differently —
 * "Hisab" in ink, "Kitab" in the brand blue, as the logo does — and because a
 * header too narrow for the whole name breaks it between them rather than
 * mid-word.
 *
 * Two places cannot import this and repeat the name: `app.json`'s `name` (the
 * launcher label) and its iOS location-permission sentence.
 */
export const APP_NAME_PARTS = ['Hisab', 'Kitab'] as const;

export const APP_NAME = APP_NAME_PARTS.join('');
