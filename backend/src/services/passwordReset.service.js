const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { fail } = require('../errors');
const prisma = require('../config/db');
const { signToken } = require('../utils/jwt');
const logger = require('../config/logger');
const { sendMail, webUrl, configured } = require('../mail/send');
const { APP_NAME, labelsFor, render } = require('../mail/reset.labels');

const SALT_ROUNDS = 10;

/** How long a link works. Long enough to find the email, short enough to matter. */
const TTL_MINUTES = 60;

/**
 * One request per address per minute. The limiter in `middleware/rateLimit.js`
 * counts IPs, which does not stop somebody pointing a botnet at one address to
 * fill an inbox — and an inbox full of reset mail is how a real reset gets
 * missed.
 */
const MIN_SECONDS_BETWEEN = 60;

/**
 * Forgetting a password, and changing one.
 *
 * Until this existed there was no way to change a password at all — signed in or
 * out — so a forgotten one meant a lost account and a lost business with it.
 *
 * ## The two rules worth knowing before changing anything here
 *
 * **Asking always succeeds.** `requestReset` answers the same whether or not the
 * address has an account. The API's other public route, `GET /invites?email=`,
 * is already an existence oracle for invited addresses; this one must not add a
 * second, because "does this person bank here" is exactly what an attacker wants
 * from a business app. The cost is that a typo gets no warning, which is the
 * trade every reset flow makes.
 *
 * **The token is never stored.** Only its SHA-256 is. A copy of the table is
 * therefore useless, which is the same reasoning as the `passwordHash` beside it.
 * SHA-256 rather than bcrypt here on purpose: the secret is 32 random bytes, not
 * a human's password, so there is nothing to brute-force and the lookup has to
 * be by exact index.
 */

const hashOf = (token) => crypto.createHash('sha256').update(token).digest('hex');

function resetEmail(user, token) {
  const labels = labelsFor(user.preferredLocale);
  const params = { appName: APP_NAME, name: user.name || user.email, minutes: TTL_MINUTES };
  const link = webUrl(`/reset-password?token=${encodeURIComponent(token)}`);

  return {
    to: user.email,
    subject: render(labels.subject, params),
    // Plain text, and short. A reset mail that looks like marketing is a reset
    // mail that lands in spam, and the one thing it must do is carry a link.
    text: [
      render(labels.greeting, params),
      '',
      render(labels.body, params),
      '',
      link,
      '',
      render(labels.expiry, params),
      render(labels.ignore, params),
      '',
      render(labels.signOff, params),
    ].join('\n'),
  };
}

/**
 * Ask for a link. Resolves whether or not the address has an account.
 *
 * A disabled account is treated as no account: it cannot sign in, so a new
 * password would not help, and saying so here would leak that it exists.
 */
async function requestReset(email) {
  const normalizedEmail = String(email ?? '').toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || user.status === 'DISABLED') {
    logger.info('password_reset_requested', { known: false });
    return;
  }

  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - MIN_SECONDS_BETWEEN * 1000) } },
  });
  if (recent) {
    logger.info('password_reset_throttled', { userId: user.id });
    return;
  }

  const token = crypto.randomBytes(32).toString('base64url');

  // Any older link stops working the moment a new one is asked for, so the one
  // in the latest email is the only one that can be used.
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOf(token),
        expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  await sendMail(resetEmail(user, token));
  logger.info('password_reset_requested', { known: true, userId: user.id, mailed: configured() });
}

/** Spend a link and set the new password. */
async function resetPassword({ token, password }) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashOf(String(token ?? '')) },
    include: { user: true },
  });

  if (!row || row.usedAt) throw fail('PASSWORD_RESET_TOKEN_INVALID', 400);
  if (row.expiresAt <= new Date()) throw fail('PASSWORD_RESET_TOKEN_EXPIRED', 400);
  // Disabled between asking and clicking: a new password would not sign them in,
  // and this one they have already proved they can read mail for.
  if (row.user.status === 'DISABLED') throw fail('AUTH_ACCOUNT_DISABLED', 403);

  // Hashed outside the transaction — bcrypt is the slow part, and nothing in it
  // needs a lock held. The same shape `account.service.js` uses.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      // `passwordChangedAt` is what signs the other devices out: a session token
      // is stateless and lasts seven days, so without it the device this reset
      // was meant to shut out would stay signed in until next week.
      data: { passwordHash, passwordChangedAt: now },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  logger.info('password_reset_completed', { userId: row.userId });
}

/**
 * Change it while signed in — the primitive that was missing, and the reason
 * Settings had nowhere to put one.
 */
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw fail('USER_NOT_FOUND', 404);

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw fail('PASSWORD_CHANGE_CURRENT_INCORRECT', 403);

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
  logger.info('password_changed', { userId });

  // Every session older than the change is now refused — including the one that
  // asked for it. Handing back a fresh token is what keeps "change my password"
  // from meaning "sign me out", while the other devices still go.
  return { token: signToken({ sub: userId }) };
}

module.exports = { requestReset, resetPassword, changePassword, TTL_MINUTES };
