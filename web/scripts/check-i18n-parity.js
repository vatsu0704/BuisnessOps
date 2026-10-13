#!/usr/bin/env node
/**
 * Checks that the web app's own strings (src/i18n/locales) exist in every
 * language, with the same placeholders as the English.
 *
 * `tsc` cannot: i18next.d.ts types t() against the English alone, so a key
 * missing from hi/gu/mr compiles cleanly and quietly renders in English. The
 * shared strings the web reads from frontend/ are covered by that app's own
 * `npm run lint:i18n`; this covers only what the web adds under `web.*`.
 *
 * It also reads the shared files for one thing neither tsc nor that check can
 * see: a `<Trans>` tag named after a void HTML element. react-i18next parses its
 * markup as HTML, so `<link>Privacy policy</link>` closes at `<link>` and the
 * words render as plain text beside an empty link — in both apps at once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = path.join(ROOT, 'src', 'i18n', 'locales');
const SHARED_LOCALES_DIR = path.join(ROOT, '..', 'frontend', 'src', 'i18n', 'locales');
const BASE = 'en';

// html-parse-stringify's list, which is what <Trans> parses its markup with.
const VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
const VOID_TAG = new RegExp(`<(${VOID_TAGS.join('|')})>`);

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, full, out);
    else out.set(full, String(child));
  }
  return out;
}

function placeholders(text) {
  return new Set([...String(text).matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]));
}

function load(locale) {
  return flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8')));
}

const base = load(BASE);
const others = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json') && f !== `${BASE}.json`)
  .map((f) => path.basename(f, '.json'));

let failed = false;

for (const locale of others) {
  const target = load(locale);
  const missing = [...base.keys()].filter((k) => !target.has(k));
  const extra = [...target.keys()].filter((k) => !base.has(k));
  const mismatched = [...base.entries()]
    .filter(([key, value]) => {
      if (!target.has(key)) return false;
      const a = placeholders(value);
      const b = placeholders(target.get(key));
      return a.size !== b.size || [...a].some((p) => !b.has(p));
    })
    .map(([key]) => key);

  if (missing.length || extra.length || mismatched.length) {
    failed = true;
    console.error(`\n${locale}.json:`);
    for (const k of missing) console.error(`  missing      ${k}`);
    for (const k of extra) console.error(`  not in en    ${k}`);
    for (const k of mismatched) console.error(`  placeholders ${k}`);
  }
}

for (const [dir, label] of [
  [LOCALES_DIR, 'web'],
  [SHARED_LOCALES_DIR, 'shared'],
]) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const strings = flatten(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    for (const [key, value] of strings) {
      const match = value.match(VOID_TAG);
      if (match) {
        failed = true;
        console.error(`\n${label} ${file}: ${key} tags <${match[1]}>, which <Trans> treats as an empty HTML element. Rename the tag.`);
      }
    }
  }
}

if (failed) {
  console.error('\nWeb translations need attention.');
  process.exit(1);
}
console.log(`Web translations: ${base.size} keys, identical in ${others.length + 1} languages.`);
