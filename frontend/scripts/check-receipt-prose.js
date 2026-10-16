const fs = require('fs');
const path = require('path');

/**
 * The fence around the app's one prose exception: the printed receipt.
 *
 * `src/constants/receiptLabels.ts` holds English words outside the locale files
 * because a receipt printer's built-in font is ASCII and cannot draw Gujarati,
 * Hindi or Marathi — the premise of "every string goes through t()" stops being
 * true for that one surface. Two things keep the exception from spreading:
 *
 *   1. Only `src/utils/receipt.ts` may import it. A screen that reached for it to
 *      "just show the same word" would put untranslated English in the app.
 *      The web app (which reads frontend/src) is checked too.
 *   2. Every value is printable ASCII. A label the printer cannot draw would
 *      print as question marks on every token.
 */

const ROOT = path.join(__dirname, '..', '..');
const LABELS = path.join(ROOT, 'frontend', 'src', 'constants', 'receiptLabels.ts');
const ALLOWED = new Set([path.join('frontend', 'src', 'utils', 'receipt.ts')]);
const SEARCH = [path.join(ROOT, 'frontend', 'src'), path.join(ROOT, 'web', 'src')];

const IMPORT_RE = /from\s+['"][^'"]*constants\/receiptLabels(?:\.ts)?['"]|require\(\s*['"][^'"]*receiptLabels/;

function walk(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, found);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const problems = [];

for (const dir of SEARCH) {
  for (const file of walk(dir)) {
    const relative = path.relative(ROOT, file);
    if (ALLOWED.has(relative) || path.resolve(file) === LABELS) continue;
    if (IMPORT_RE.test(fs.readFileSync(file, 'utf8'))) {
      problems.push(`${relative} imports constants/receiptLabels`);
    }
  }
}

// The values are the single- or double-quoted strings inside the exported object.
const source = fs.readFileSync(LABELS, 'utf8');
const body = source.slice(source.indexOf('RECEIPT_LABELS'));
const VALUE_RE = /:\s*(['"])((?:\\.|(?!\1).)*)\1/g;
let match;
let count = 0;
while ((match = VALUE_RE.exec(body))) {
  count += 1;
  const value = match[2];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code > 0x7e) {
      problems.push(`receiptLabels value "${value}" contains "${char}", which the printer cannot draw`);
      break;
    }
  }
}
if (count === 0) problems.push('found no labels in receiptLabels.ts — has its shape changed?');

if (problems.length) {
  console.error('Receipt prose boundary FAILED:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    '\nOnly utils/receipt.ts may use the receipt labels, and every label must be\n' +
      'printable ASCII. Anything a screen shows is translated like every other\n' +
      'string — see the header of src/constants/receiptLabels.ts for why.\n'
  );
  process.exit(1);
}

console.log(`Receipt prose boundary OK — ${count} ASCII labels, used only by utils/receipt.ts.`);
