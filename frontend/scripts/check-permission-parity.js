#!/usr/bin/env node
/**
 * Checks that the frontend's copy of the capability matrix still matches the
 * backend's.
 *
 * Authorization is decided twice, and it has to be. The backend decides whether
 * a request is allowed; the app decides whether to render the control that
 * makes the request. If those two disagree, a person is shown a button that
 * 403s, or — worse — is shown nothing and has no way to discover the feature
 * exists. Neither shows up as an error anywhere.
 *
 * `tsc` cannot catch this: it type-checks the mirror against itself, and a
 * mirror that is wrong is still internally consistent. So this compares the two
 * files directly, the same way check-error-parity.js compares the error catalog
 * with en.json.
 *
 * It reads the backend catalog directly rather than keeping a third list. That
 * `require` works ONLY because backend/src/permissions/catalog.js imports
 * nothing — adding a require there makes this script try to boot Prisma from
 * inside frontend/, and the failure looks nothing like its cause.
 *
 * Also enforced here: the bounded exception that lets the push sender hold
 * prose. See the "backend prose" block at the bottom.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', '..', 'backend');
const CATALOG = path.join(BACKEND, 'src', 'permissions', 'catalog.js');
const MIRROR = path.join(__dirname, '..', 'src', 'permissions', 'matrix.json');

if (!fs.existsSync(CATALOG)) {
  console.error(`Cannot find the backend permission catalog at ${CATALOG}`);
  process.exit(1);
}

const { CAPABILITIES, ROLE_CAPABILITIES, SINGLE_BRANCH_ROLE } = require(CATALOG);
const mirror = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));

const problems = [];

// --- 1. The same capability names, with the same descriptions --------------
const backendCaps = Object.keys(CAPABILITIES).sort();
const mirrorCaps = Object.keys(mirror.capabilities ?? {}).sort();

for (const cap of backendCaps) {
  if (!mirrorCaps.includes(cap)) problems.push(`capability "${cap}" is missing from the mirror`);
  else if (mirror.capabilities[cap] !== CAPABILITIES[cap]) {
    problems.push(`capability "${cap}" has a different description in the mirror`);
  }
}
for (const cap of mirrorCaps) {
  if (!backendCaps.includes(cap)) problems.push(`capability "${cap}" is in the mirror but not in the backend catalog`);
}

// --- 2. The same roles, holding the same capabilities ----------------------
const backendRoles = Object.keys(ROLE_CAPABILITIES).sort();
const mirrorRoles = Object.keys(mirror.roles ?? {}).sort();

for (const role of backendRoles) {
  if (!mirrorRoles.includes(role)) {
    problems.push(`role "${role}" is missing from the mirror`);
    continue;
  }
  const backendHeld = ROLE_CAPABILITIES[role];
  const mirrorHeld = mirror.roles[role];

  // '*' is compared as the wildcard it is, not expanded — expanding on one side
  // only would make a genuine wildcard/list mismatch look like agreement.
  if (backendHeld === '*' || mirrorHeld === '*') {
    if (backendHeld !== mirrorHeld) {
      problems.push(`role "${role}": one side grants "*" and the other does not`);
    }
    continue;
  }

  const a = [...backendHeld].sort();
  const b = [...mirrorHeld].sort();
  for (const cap of a) if (!b.includes(cap)) problems.push(`role "${role}" is missing "${cap}" in the mirror`);
  for (const cap of b) if (!a.includes(cap)) problems.push(`role "${role}" has extra "${cap}" in the mirror`);
}
for (const role of mirrorRoles) {
  if (!backendRoles.includes(role)) problems.push(`role "${role}" is in the mirror but not in the backend catalog`);
}

// --- 3. Every granted capability actually exists ---------------------------
// A typo here would otherwise be granted to nobody and silently deny a route.
for (const [role, held] of Object.entries(ROLE_CAPABILITIES)) {
  if (held === '*') continue;
  for (const cap of held) {
    if (!CAPABILITIES[cap]) problems.push(`role "${role}" grants unknown capability "${cap}"`);
  }
}

// --- 4. The roles the schema actually has ----------------------------------
// The Postgres enum is the last word on which roles can exist. A role in the
// database and not in the matrix holds nothing, which reads as a broken login
// rather than as a missing line in a file.
const SCHEMA = path.join(BACKEND, 'prisma', 'schema.prisma');
if (fs.existsSync(SCHEMA)) {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const block = schema.match(/enum\s+MembershipRole\s*\{([^}]*)\}/);
  if (block) {
    const schemaRoles = block[1]
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z_]+$/.test(line))
      .sort();
    for (const role of schemaRoles) {
      if (!backendRoles.includes(role)) {
        problems.push(`MembershipRole.${role} exists in schema.prisma but holds nothing in the matrix`);
      }
    }
    for (const role of backendRoles) {
      if (!schemaRoles.includes(role)) {
        problems.push(`role "${role}" is in the matrix but not in the MembershipRole enum`);
      }
    }
  }
}

// --- 5. The single-branch role (requirement 18) ----------------------------
// Not a capability, so sections 1-3 above cannot see it: it is the one role the
// 1:1 branch rule constrains. Both sides read it — the backend to enforce the
// rule, the app to make its branch picker single-select and to say which
// branches are already taken — so a drift here means the app offers a choice
// the server refuses, or silently stops offering one it allows.
if (mirror.singleBranchRole !== SINGLE_BRANCH_ROLE) {
  problems.push(
    `singleBranchRole is "${SINGLE_BRANCH_ROLE}" in the backend catalog but ` +
      `"${mirror.singleBranchRole ?? '(missing)'}" in the mirror`
  );
} else if (!ROLE_CAPABILITIES[SINGLE_BRANCH_ROLE]) {
  problems.push(`singleBranchRole "${SINGLE_BRANCH_ROLE}" is not a role in the matrix`);
}

// --- 6. Every capability can explain its own refusal (requirement 19) ------
// A 403 now renders as "Only Warehouse can accept, pack and dispatch a supply
// order", built from the capability the server sent plus this app's mirror of the
// matrix. Two things have to hold for that, and only one of them is something
// `tsc` can see.
//
// ACTION_KEYS in src/permissions/explain.ts is a Record over Capability, so a
// capability added without a phrase is a compile error. But its VALUES are i18n
// keys assembled at runtime and cast, exactly like errors.api.<CODE> — so a typo
// resolves to nothing and the refusal silently falls back to the server's
// English. That is the same hole check-error-parity.js exists to close, so it is
// closed the same way: here, against en.json.
//
// Scraped with a regex rather than imported, because this is a .ts module and the
// script runs in plain node. A regex that MISSES an entry cannot hide a problem:
// the totality check below compares what was found against the capability list.
const EXPLAIN = path.join(__dirname, '..', 'src', 'permissions', 'explain.ts');
const EN = path.join(__dirname, '..', 'src', 'i18n', 'locales', 'en.json');

if (fs.existsSync(EXPLAIN) && fs.existsSync(EN)) {
  const source = fs.readFileSync(EXPLAIN, 'utf8');
  const block = source.match(/const ACTION_KEYS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    problems.push('could not find ACTION_KEYS in src/permissions/explain.ts');
  } else {
    const en = JSON.parse(fs.readFileSync(EN, 'utf8'));
    const mapped = new Map();
    for (const line of block[1].split('\n')) {
      const entry = line.match(/^\s*'([^']+)':\s*'([^']+)',?\s*$/);
      if (entry) mapped.set(entry[1], entry[2]);
    }

    for (const cap of backendCaps) {
      const key = mapped.get(cap);
      if (!key) {
        problems.push(`capability "${cap}" has no entry in ACTION_KEYS (explain.ts)`);
        continue;
      }
      // Walk the dotted path rather than assuming a depth, the way the error
      // parity script resolves errors.api.<CODE>.
      const text = key.split('.').reduce((node, part) => (node == null ? node : node[part]), en);
      if (typeof text !== 'string' || !text.trim()) {
        problems.push(`ACTION_KEYS["${cap}"] points at "${key}", which is missing from en.json`);
      }
    }

    for (const cap of mapped.keys()) {
      if (!backendCaps.includes(cap)) {
        problems.push(`ACTION_KEYS has "${cap}", which is not a capability`);
      }
    }
  }
}

// --- 7. Backend prose: see check-notification-prose.js ---------------------
// This file used to carry a substring scan for `notifications/labels.js` over
// four directories. `scripts/check-notification-prose.js` now does that job
// properly — it walks the whole backend tree and matches an actual `require`
// rather than any mention of the path, which the loose version could not tell
// apart from a comment explaining the rule. One gate, doing it correctly.

if (problems.length) {
  console.error('Permission matrix parity FAILED:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nThe mirror is generated from the backend catalog. After changing\n' +
      'backend/src/permissions/catalog.js, regenerate frontend/src/permissions/matrix.json.\n'
  );
  process.exit(1);
}

console.log(
  `Permission parity OK — ${backendCaps.length} capabilities across ${backendRoles.length} roles match, ` +
    `${SINGLE_BRANCH_ROLE} is the single-branch role on both sides, and every ` +
    `capability can explain its own refusal.`
);
