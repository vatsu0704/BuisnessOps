/**
 * The product's name — the one place the app writes it.
 *
 * Wordmarks render it through `Wordmark`, and translations write `{{appName}}`,
 * which i18next fills from `interpolation.defaultVariables` (see i18n/index.ts),
 * so no caller passes it and no locale file spells it. A brand name reads the
 * same in every language, so it is not a translation key; never type it into a
 * component or a locale file.
 *
 * ## Why the two are written out separately
 *
 * Until KitnaPay they were one value — the name was the parts joined. The logo
 * sets the wordmark as "Kitna" in navy and "pay" in coral, with a lowercase p,
 * while everything written down — store listings, emails, the browser tab —
 * spells it KitnaPay. Deriving one from the other would force a choice between
 * an artwork that does not match the screenshot and prose that does not match
 * the brand. So `APP_NAME_PARTS` is what the mark draws and `APP_NAME` is what
 * sentences say, and they are allowed to differ by that one capital.
 *
 * The parts stay a pair because the wordmark colours them differently and
 * because a header too narrow for the whole name breaks it between them rather
 * than mid-word. `scripts/generate-brand-assets.js` reads this two-element
 * shape out of the source text with a regex, and throws if it changes.
 *
 * Five places cannot import this and repeat the name: `app.json`'s `name` (the
 * launcher label) and its iOS location-permission sentence, `web/index.html`'s
 * `<title>` and `theme-color` (they render before any script does), and the
 * backend's `mail/reset.labels.js`, which cannot reach into `frontend/src`.
 */
export const APP_NAME_PARTS = ['Kitna', 'pay'] as const;

export const APP_NAME = 'KitnaPay';
