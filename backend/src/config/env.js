/**
 * Refuse to start rather than fail later, quietly or dangerously.
 *
 * `JWT_SECRET` had no check of any kind, and both ways of getting it wrong were
 * bad in a way nobody would notice from the outside:
 *
 *  - **Unset.** The server starts, serves every public route, and only throws
 *    when somebody tries to log in — as a 500 from inside `jsonwebtoken`
 *    ("secretOrPrivateKey must have a value"), which reads like a broken
 *    database rather than a missing variable.
 *  - **Left as the example value.** `.env.example` shipped `change-me`, so a
 *    deployment that copied it signs its tokens with a string published in the
 *    repository. Anyone who has read it can mint `{ sub: <any user id> }` and
 *    become that person in every business they belong to. Nothing anywhere
 *    would look wrong.
 *
 * ## Why strength is only enforced in production
 *
 * CI runs with `JWT_SECRET: ci-test-secret` and the test database has its own
 * short value; both are fine, because neither signs a token anybody outside the
 * run can present. Enforcing length everywhere would break CI and every
 * developer's checkout on the day it landed, which is how a guard gets deleted
 * instead of satisfied. Outside production the value only has to *exist*.
 */

const { missingOperatorVariables } = require('../legal/operator');

/** Values that mean "nobody has set this yet", whatever the file says. */
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'changeme',
  'change_me',
  'secret',
  'your-secret-here',
  'replace-me',
]);

/**
 * 32 characters of a random secret is the floor worth defending; the generator
 * suggested below produces 64. Short secrets are brute-forceable offline from a
 * single captured token, and a token here is valid for seven days.
 */
const MIN_SECRET_LENGTH = 32;

function problemsWith(env) {
  const problems = [];
  const isProduction = env.NODE_ENV === 'production';

  if (!env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set — Prisma cannot reach a database.');
  }

  const secret = env.JWT_SECRET;
  if (!secret) {
    problems.push(
      'JWT_SECRET is not set — the server would start and then fail every single login with a 500.'
    );
  } else if (isProduction) {
    if (PLACEHOLDER_SECRETS.has(secret.trim().toLowerCase())) {
      problems.push(
        'JWT_SECRET is still an example placeholder. It is published in this repository, ' +
          'so anyone who has read it could sign a token for any user in any business.'
      );
    } else if (secret.length < MIN_SECRET_LENGTH) {
      problems.push(
        `JWT_SECRET is ${secret.length} characters long; production requires at least ${MIN_SECRET_LENGTH}.`
      );
    }
  }

  return problems;
}

/**
 * Things worth saying at startup that are not worth refusing to start over.
 *
 * The public privacy policy names the company that operates the app, from
 * `LEGAL_NAME`, `LEGAL_ADDRESS` and `SUPPORT_EMAIL` (see legal/operator.js).
 * The server has to run before the company is registered, so their absence is
 * only reported — but in production, where the store listing links to that
 * page, it is reported every time the server starts.
 */
function warningsFor(env) {
  if (env.NODE_ENV !== 'production') return [];
  const warnings = [];

  const missing = missingOperatorVariables(env);
  if (missing.length > 0) {
    warnings.push(
      `${missing.join(', ')} not set — /privacy and /delete-account say the operator's details are still being finalised.`
    );
  }

  // Optional for the same reason the Firebase credential is: a server with no
  // mail account still starts and serves. But a reset flow that silently does
  // nothing is worse than none, so production says so at every start — and the
  // link goes to the log, where it is at least reachable by hand.
  if (!env.SMTP_URL) {
    warnings.push('SMTP_URL not set — password-reset links are written to the log instead of emailed.');
  } else if (!env.MAIL_FROM) {
    warnings.push('MAIL_FROM not set — reset email will be sent with the provider default sender.');
  }
  if (!env.PUBLIC_WEB_URL) {
    warnings.push('PUBLIC_WEB_URL not set — a password-reset link will have no host and cannot be opened.');
  }

  return warnings;
}

/**
 * Called once from `server.js`, after dotenv and before `listen`.
 *
 * Deliberately not called from `app.js`: the test suite imports the app
 * directly and must not have a `process.exit` in its import path.
 */
function assertEnv(env = process.env) {
  for (const warning of warningsFor(env)) console.warn(`[api] ${warning}`);

  const problems = problemsWith(env);
  if (problems.length === 0) return;

  console.error('\n[api] Refusing to start — the environment is not safe to serve with:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    '\nSee backend/.env.example. To generate a strong secret:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"\n' +
      '\nChanging JWT_SECRET signs everyone out, which is the intended effect when it leaks.\n'
  );
  process.exit(1);
}

module.exports = { assertEnv, problemsWith, warningsFor, MIN_SECRET_LENGTH, PLACEHOLDER_SECRETS };
