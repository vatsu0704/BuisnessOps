const fs = require('fs');
const path = require('path');

/**
 * The gate on the backend's two prose dictionaries.
 *
 * The backend is not supposed to write user-facing prose at all, and almost
 * never does — an error is a code and the device renders it. Two files are
 * exceptions, each for a stated reason:
 *
 * - `notifications/labels.js` — Android draws a notification before app code
 *   runs, so there is no moment in which the device could render it. The
 *   device reports its own language when it registers a push token, so the
 *   backend is told rather than guessing.
 * - `documents/payslip.labels.js` — a payslip is rendered to PDF on the
 *   server, where the app cannot reach it.
 *
 * Neither had a gate before this. `payslip.labels.js` has carried four
 * languages since Phase 4 and could have drifted apart silently for months:
 * nothing in CI compared them, and a missing key renders as `undefined` on a
 * document somebody is handed with their pay.
 *
 * This checks three things:
 *   1. hi/gu/mr have exactly the keys `en` has, in both files.
 *   2. Every placeholder `en` uses appears in the translations, so a sentence
 *      does not silently lose the number it was about.
 *   3. Every notification code the backend can send has a matching
 *      `notifications.<CODE>` key in the APP's `en.json` — because the in-app
 *      centre re-renders from there, and a code with no key renders raw.
 */

const BACKEND = path.join(__dirname, '..', '..', 'backend', 'src');
const APP_EN = path.join(__dirname, '..', 'src', 'i18n', 'locales', 'en.json');

const failures = [];

function placeholdersOf(value) {
  return new Set([...String(value).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]));
}

/** Flatten `{ a: { b: 'x' } }` to `{ 'a.b': 'x' }` so nesting is comparable. */
function flatten(object, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, full));
    } else {
      out[full] = value;
    }
  }
  return out;
}

function checkDictionary(label, dictionary) {
  const locales = Object.keys(dictionary);
  if (!locales.includes('en')) {
    failures.push(`${label}: no 'en' — it is the source of truth`);
    return;
  }

  const en = flatten(dictionary.en);
  const enKeys = Object.keys(en).sort();

  for (const locale of locales.filter((l) => l !== 'en')) {
    const other = flatten(dictionary[locale]);
    const otherKeys = Object.keys(other).sort();

    for (const key of enKeys) {
      if (!(key in other)) failures.push(`${label}: ${locale} is missing ${key}`);
    }
    for (const key of otherKeys) {
      if (!(key in en)) failures.push(`${label}: ${locale} has ${key}, which 'en' does not`);
    }

    for (const key of enKeys) {
      if (!(key in other)) continue;
      const expected = placeholdersOf(en[key]);
      const actual = placeholdersOf(other[key]);
      for (const placeholder of expected) {
        if (!actual.has(placeholder)) {
          failures.push(`${label}: ${locale}.${key} drops {{${placeholder}}}`);
        }
      }
    }
  }

  return enKeys.length;
}

// --- 1 & 2: the two backend dictionaries -----------------------------------

const { LABELS: NOTIFICATION_LABELS, NOTIFICATION_CODES } = require(
  path.join(BACKEND, 'notifications', 'labels.js')
);
const notificationKeys = checkDictionary('notifications/labels.js', NOTIFICATION_LABELS);

const payslipModule = require(path.join(BACKEND, 'documents', 'payslip.labels.js'));
const payslipLabels = payslipModule.LABELS ?? payslipModule;
const payslipKeys = checkDictionary('documents/payslip.labels.js', payslipLabels);

// --- 3: every code the backend sends is renderable in the app --------------

const appEn = JSON.parse(fs.readFileSync(APP_EN, 'utf8'));
const appNotifications = appEn.notifications ?? {};

for (const code of NOTIFICATION_CODES) {
  if (!(code in appNotifications)) {
    failures.push(
      `app en.json: notifications.${code} is missing — the backend can send it, ` +
        'and the in-app centre would render the raw code'
    );
  }
}
for (const code of Object.keys(appNotifications)) {
  if (!NOTIFICATION_CODES.includes(code)) {
    failures.push(`app en.json: notifications.${code} has no backend code that sends it`);
  }
}

// --- Report ----------------------------------------------------------------

if (failures.length) {
  console.error('Backend i18n parity FAILED:\n');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nThe backend renders prose in exactly two places and both are translated ' +
      'by hand. Add the wording to every language, not only English.\n'
  );
  process.exit(1);
}

console.log(
  `backend i18n parity OK — ${notificationKeys} notification and ${payslipKeys} payslip ` +
    `labels match across ${Object.keys(NOTIFICATION_LABELS).length} languages, and all ` +
    `${NOTIFICATION_CODES.length} codes render in the app.`
);
