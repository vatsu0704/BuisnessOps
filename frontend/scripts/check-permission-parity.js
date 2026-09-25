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

const { CAPABILITIES, ROLE_CAPABILITIES } = require(CATALOG);
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

// --- 5. Backend prose: see check-notification-prose.js ---------------------
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
  `Permission parity OK — ${backendCaps.length} capabilities across ${backendRoles.length} roles match.`
);
