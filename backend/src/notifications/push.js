const fs = require('fs');
const path = require('path');
const { LABELS } = require('./labels');

/**
 * Firebase Cloud Messaging, and the only file permitted to render notification
 * prose — see the header of `labels.js` for why that boundary exists and what
 * enforces it.
 *
 * ## Degrading without Firebase is a feature, not a fallback
 *
 * With no `FIREBASE_SERVICE_ACCOUNT` set, this module loads, logs one line, and
 * every send becomes a no-op that reports `SKIPPED`. Notifications are still
 * written to the database and still appear in the in-app centre; only the push
 * is missing.
 *
 * That is deliberate. The whole test suite, CI, and any machine that has not
 * been through `Docs/FIREBASE_SETUP.md` must still be able to mark attendance
 * and dispatch an order. Requirement 2 says explicitly that marking succeeds
 * for a worker who cannot be notified — the same must be true of a server that
 * cannot notify anybody.
 */

let messaging = null;
let initialised = false;

/** `{{name}}` → params.name. Same shape as the error catalog's interpolation. */
function interpolate(template, params) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    params[key] === undefined ? match : String(params[key])
  );
}

/**
 * Render a code in one language.
 *
 * Falls back to English per-code rather than per-language: a code added to `en`
 * and not yet translated should arrive in English rather than not at all. The
 * parity gate stops that state from surviving CI, but a notification is not the
 * place to discover it.
 */
function render(code, locale, params = {}) {
  const lower = String(locale || 'en').toLowerCase();
  const entry = LABELS[lower]?.[code] ?? LABELS.en[code];
  if (!entry) return null;
  return {
    title: interpolate(entry.title, params),
    body: interpolate(entry.body, params),
  };
}

function init() {
  if (initialised) return;
  initialised = true;

  const configured = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!configured) {
    // eslint-disable-next-line no-console
    console.log('[push] FIREBASE_SERVICE_ACCOUNT not set — notifications are recorded but not sent');
    return;
  }

  try {
    // Required lazily so a machine with no Firebase never pays for loading the
    // SDK, and so a broken credential cannot stop the API booting.
    const admin = require('firebase-admin');
    const resolved = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
    const credential = JSON.parse(fs.readFileSync(resolved, 'utf8'));

    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(credential) });
    messaging = admin.messaging(app);
    // eslint-disable-next-line no-console
    console.log(`[push] Firebase ready (project ${credential.project_id})`);
  } catch (err) {
    messaging = null;
    // eslint-disable-next-line no-console
    console.error(`[push] Firebase could not start, notifications will not be sent: ${err.message}`);
  }
}

function isEnabled() {
  init();
  return messaging !== null;
}

/**
 * FCM reports a dead token with one of these. Anything else is a transient
 * failure — a network blip, a quota — and must NOT disable the device, or one
 * bad afternoon silently unsubscribes the whole business.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Send one notification to one device.
 *
 * Returns `{ ok, skipped, deadToken, error }` rather than throwing: a push that
 * fails must never roll back the thing it was announcing. Marking somebody
 * absent succeeded whether or not their phone heard about it.
 */
async function sendToDevice({ token, locale, code, params, deepLink }) {
  init();
  if (!messaging) return { ok: false, skipped: true };

  const text = render(code, locale, params);
  if (!text) return { ok: false, skipped: true, error: `unknown notification code ${code}` };

  try {
    await messaging.send({
      token,
      // What the lock screen draws, in the language this DEVICE reported.
      notification: { title: text.title, body: text.body },
      // The contract. Every value must be a string — FCM rejects a data payload
      // containing anything else, which is why params and deepLink are JSON
      // rather than nested objects. The app re-renders from these, so a list
      // opened a week later is in whatever language is selected then.
      data: {
        code,
        params: JSON.stringify(params ?? {}),
        deepLink: JSON.stringify(deepLink ?? null),
      },
      android: {
        priority: 'high',
        notification: {
          // Must match the channel the app creates on first run, or Android 8+
          // drops the notification into a default channel the user cannot tune.
          channelId: 'updates',
        },
      },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      deadToken: DEAD_TOKEN_CODES.has(err.code),
      error: err.message,
    };
  }
}

module.exports = { sendToDevice, isEnabled, render };
