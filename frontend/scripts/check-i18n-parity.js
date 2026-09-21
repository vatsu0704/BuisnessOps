#!/usr/bin/env node
/**
 * Checks that every locale carries the same keys as en.json, with the same
 * interpolation placeholders.
 *
 * `tsc --noEmit` does NOT catch this. i18next.d.ts types t() against en.json
 * alone, so a key present in en.json but missing from hi/gu/mr compiles
 * cleanly and silently renders the English fallback at runtime — the failure
 * looks like "we forgot to translate that", which is indistinguishable from a
 * deliberate choice until a user reports it.
 *
 * Placeholder parity matters for the same reason: dropping {{count}} from a
 * translation is a runtime bug, not a fallback.
 */
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const BASE = 'en';

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
    console.error(`\n${locale}.json`);
    if (missing.length) console.error(`  missing ${missing.length} key(s):\n    ${missing.join('\n    ')}`);
    if (extra.length) console.error(`  ${extra.length} key(s) not in ${BASE}.json:\n    ${extra.join('\n    ')}`);
    if (mismatched.length) {
      console.error(`  ${mismatched.length} key(s) with different {{placeholders}}:\n    ${mismatched.join('\n    ')}`);
    }
  }
}

if (failed) {
  console.error(`\ni18n parity check failed. en.json is the source of truth (${base.size} keys).`);
  process.exit(1);
}

console.log(`i18n parity OK — ${others.length} locales match en.json (${base.size} keys).`);
