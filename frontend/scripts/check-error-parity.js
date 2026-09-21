#!/usr/bin/env node
/**
 * Checks that every error code the backend can send has a translation here.
 *
 * The API no longer sends prose — it sends a code, and the app renders that
 * code through `t('errors.api.<CODE>')` in whichever of the four languages is
 * selected. A code with no entry in `en.json` falls back to the English the
 * server sent, which works but silently un-translates that message for every
 * Hindi, Gujarati and Marathi user. Nothing else catches that: `tsc` cannot,
 * because the key is assembled at runtime, and `check-i18n-parity.js` only
 * compares the locale files with each other, so a code missing from all four
 * looks perfectly consistent.
 *
 * This reads the backend catalog directly rather than keeping a second list,
 * because a copied list is one more thing to forget.
 */
const fs = require('fs');
const path = require('path');

const CATALOG = path.join(__dirname, '..', '..', 'backend', 'src', 'errors', 'catalog.js');
const EN = path.join(__dirname, '..', 'src', 'i18n', 'locales', 'en.json');

if (!fs.existsSync(CATALOG)) {
  console.error(`Cannot find the backend error catalog at ${CATALOG}`);
  process.exit(1);
}

const { API_MESSAGES, FIELD_MESSAGES } = require(CATALOG);
const en = JSON.parse(fs.readFileSync(EN, 'utf8'));

const problems = [];
// Placeholders the user-facing copy deliberately leaves out — reported for
// review rather than treated as faults.
const omitted = [];

function check(codes, section) {
  const translations = en.errors?.[section] ?? {};
  for (const code of Object.keys(codes)) {
    if (!translations[code]) problems.push(`missing errors.${section}.${code}`);
  }
  for (const code of Object.keys(translations)) {
    if (!codes[code]) problems.push(`errors.${section}.${code} has no matching backend code`);
  }
}

check(API_MESSAGES, 'api');
check(FIELD_MESSAGES, 'validation');

function placeholders(text) {
  return new Set([...String(text).matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]));
}

for (const [section, codes] of [
  ['api', API_MESSAGES],
  ['validation', FIELD_MESSAGES],
]) {
  for (const [code, template] of Object.entries(codes)) {
    const translation = en.errors?.[section]?.[code];
    if (!translation) continue;

    const available = placeholders(template);
    // The client supplies the field label itself, from errors.field.*, so
    // {{field}} is always available to a validation message.
    if (section === 'validation') available.add('field');
    const used = placeholders(translation);

    // A placeholder nothing supplies renders as literal {{braces}} on screen.
    for (const key of used) {
      if (!available.has(key)) {
        problems.push(`errors.${section}.${code} uses {{${key}}}, which nothing supplies`);
      }
    }
    // Dropping one is the opposite case, and is often right: the server's
    // sentence names a URL path or a database column, and the person reading
    // the app is better off without it. Reported, never failed.
    for (const key of available) {
      if (!used.has(key) && key !== 'field') omitted.push(`errors.${section}.${code} omits {{${key}}}`);
    }
  }
}

if (problems.length) {
  console.error('Error-code parity FAILED:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

const total = Object.keys(API_MESSAGES).length + Object.keys(FIELD_MESSAGES).length;
console.log(`error parity OK — all ${total} backend error codes are translated.`);
if (omitted.length) {
  console.log(`\n${omitted.length} message(s) deliberately drop a server placeholder:`);
  for (const note of omitted) console.log(`  ${note}`);
}
