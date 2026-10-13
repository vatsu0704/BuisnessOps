#!/usr/bin/env node
/**
 * Every file the web app reaches inside frontend/src — through `@shared/` and then
 * through that file's own imports — must import only relative paths or packages
 * the web app itself has.
 *
 * Those files are compiled by the web's toolchain, where `@/` means `web/src` and
 * React Native does not exist. One `@/` import or one `expo-*` import added to a
 * shared file compiles cleanly for the phone and breaks the web — with a tsc error
 * pointing somewhere inside web/, nowhere near the line that caused it. This names
 * the line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_SRC = path.join(ROOT, 'src');
const SHARED_SRC = path.join(ROOT, '..', 'frontend', 'src');

/**
 * The only packages a shared file may import: the ones vite.config.ts dedupes and
 * tsconfig.app.json maps to the web's own node_modules. Any other bare import
 * from frontend/src would resolve to frontend/node_modules — a second copy, or in
 * CI none. Add a package here only together with those two.
 */
const SHARED_PACKAGES = new Set(['i18next', 'react', 'react-dom', 'react-i18next']);

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiers(file) {
  if (file.endsWith('.json')) return [];
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2]);
}

function resolveFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const problems = [];
const queue = [];
const seen = new Set();

// The entry points: every @shared/ import anywhere in web/src.
for (const file of walk(WEB_SRC)) {
  for (const spec of specifiers(file)) {
    if (!spec.startsWith('@shared/')) continue;
    const target = resolveFile(path.join(SHARED_SRC, spec.slice('@shared/'.length)));
    if (!target) problems.push(`${path.relative(ROOT, file)}: ${spec} does not exist in frontend/src`);
    else queue.push(target);
  }
}

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const where = path.relative(path.join(ROOT, '..'), file).replace(/\\/g, '/');

  for (const spec of specifiers(file)) {
    if (spec.startsWith('.')) {
      const target = resolveFile(path.resolve(path.dirname(file), spec));
      if (!target) problems.push(`${where}: ${spec} does not resolve`);
      else if (!target.startsWith(SHARED_SRC)) problems.push(`${where}: ${spec} leaves frontend/src`);
      else queue.push(target);
    } else if (spec.startsWith('@/')) {
      problems.push(`${where}: imports ${spec} — "@/" means web/src in the web build. Use a relative path.`);
    } else if (spec === 'react-native' || spec.startsWith('react-native-') || spec.startsWith('expo') || spec.startsWith('@expo/')) {
      problems.push(`${where}: imports ${spec}, which does not exist in a browser. Keep it out of shared files.`);
    } else if (!SHARED_PACKAGES.has(packageName(spec))) {
      problems.push(
        `${where}: imports ${spec}. A shared file may import only ${[...SHARED_PACKAGES].join(', ')} — ` +
          "anything else resolves to the app's own node_modules. See SHARED_PACKAGES in vite.config.ts."
      );
    }
  }
}

if (problems.length) {
  console.error('Files the web app shares with frontend/ import something it cannot use:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nSee "Web app" in CLAUDE.md: a shared file imports only its siblings and the packages listed above.');
  process.exit(1);
}

console.log(`Shared imports OK — ${seen.size} files from frontend/src, all importable by the web app.`);
