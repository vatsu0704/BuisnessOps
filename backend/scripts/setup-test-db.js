#!/usr/bin/env node
/**
 * Applies every committed migration to the test database, creating it if it
 * doesn't exist. Run once after cloning, and again whenever a new migration
 * lands: `npm run test:setup`.
 *
 * Prisma 5 has no `--env-file` flag and reads .env unconditionally, so pointing
 * it at the test database means loading .env.test here and handing the result
 * down as the child process's environment. Doing that in Node rather than an
 * inline `VAR=... npx prisma` keeps it working in PowerShell and cmd, not just
 * Git Bash. Prisma's migrate engine creates the database itself when it is
 * absent, so this needs no `pg` client and no psql on PATH.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(backendDir, '.env.test') });

const url = process.env.DATABASE_URL || '';
if (!/test|_ci/i.test(url)) {
  console.error(
    'backend/.env.test is missing, or its DATABASE_URL does not look like a test\n' +
      'database. Expected something containing "test", e.g.\n' +
      '  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/buisnessops_test?schema=public"'
  );
  process.exit(1);
}

console.log(`Applying migrations to ${url.replace(/:[^:@/]*@/, ':***@')}`);
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
  cwd: backendDir,
  shell: process.platform === 'win32',
});
