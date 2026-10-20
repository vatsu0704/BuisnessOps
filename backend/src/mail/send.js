const logger = require('../config/logger');

/**
 * The one thing this backend sends that is not a push notification.
 *
 * ## How it degrades, and why that shape
 *
 * Unset `SMTP_URL` is not an error. It is the same contract
 * `FIREBASE_SERVICE_ACCOUNT` has: the module loads, logs one line, and every
 * send becomes a no-op — so CI, a fresh checkout and a laptop with no mail
 * account all start and serve normally.
 *
 * A reset flow that silently does nothing would be worse than useless, so the
 * no-op is **loud**: the link is written to the log, which makes the whole flow
 * testable before anybody opens an email account, and a production server warns
 * at every start (see `config/env.js`).
 *
 * Plain SMTP rather than a provider's own API, so Brevo, Resend, SendGrid, SES
 * or a Gmail app password are all a matter of filling in one setting.
 */

let transport;
let announced = false;

function configured() {
  return Boolean(process.env.SMTP_URL);
}

function getTransport() {
  if (transport !== undefined) return transport;
  if (!configured()) {
    transport = null;
    return transport;
  }
  // Required lazily: nothing should pay for this on a server that never mails,
  // and the test suite imports the app without a mail account.
  const nodemailer = require('nodemailer');
  transport = nodemailer.createTransport(process.env.SMTP_URL);
  return transport;
}

function announceOnce() {
  if (announced) return;
  announced = true;
  if (!configured()) {
    logger.info('mail_not_configured', { note: 'SMTP_URL not set — emails are logged, not sent' });
  }
}

/**
 * Send one plain-text email. Never throws.
 *
 * A caller is always doing something else that matters more — minting a reset
 * token, say — and a mail failure must not roll that back or turn into a 500
 * that tells an attacker the address exists. The same reasoning `push.js` uses.
 */
async function sendMail({ to, subject, text }) {
  announceOnce();
  const mailer = getTransport();

  if (!mailer) {
    // The whole message, so a developer can follow the link out of the log.
    logger.info('mail_skipped', { to, subject, text });
    return { sent: false, reason: 'NOT_CONFIGURED' };
  }

  try {
    await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_FROM, to, subject, text });
    logger.info('mail_sent', { to, subject });
    return { sent: true };
  } catch (err) {
    logger.error('mail_failed', { to, subject }, err);
    return { sent: false, reason: 'SEND_FAILED' };
  }
}

/**
 * Where a link in an email should point.
 *
 * `PUBLIC_WEB_URL` is the hosted web app. Nothing in this backend has ever had to
 * build an absolute URL to a client before, which is why there was no such
 * setting until now.
 */
function webUrl(path) {
  const base = (process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
  return `${base}${path}`;
}

module.exports = { sendMail, webUrl, configured };
