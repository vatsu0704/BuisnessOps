const fs = require('fs');
const path = require('path');

/**
 * The fence around the backend's one prose exception.
 *
 * `notifications/labels.js` exists because Android draws a notification before
 * any app code can run, and a device reports its own language when it registers
 * a push token — so for that one channel the backend genuinely knows who is
 * reading. Nothing else in the backend may use it.
 *
 * Without this gate the exception is an invitation: the moment a controller
 * requires the label file to "just put a nice message in this response", the
 * reason it was allowed stops being true and the project quietly has backend
 * i18n in the request path, rendered in a language nobody asked for.
 *
 * Only `notifications/push.js` may require it. That is the file that talks to
 * FCM and the only one with a device locale in its hand.
 */

const BACKEND_SRC = path.join(__dirname, '..', '..', 'backend', 'src');
const ALLOWED = new Set([path.join('notifications', 'push.js')]);

const IMPORT_RE = /require\(\s*['"][^'"]*notifications\/labels(?:\.js)?['"]\s*\)/;

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

const offenders = [];
for (const file of walk(BACKEND_SRC)) {
  const relative = path.relative(BACKEND_SRC, file);
  if (ALLOWED.has(relative)) continue;
  if (IMPORT_RE.test(fs.readFileSync(file, 'utf8'))) offenders.push(relative);
}

if (offenders.length) {
  console.error('Notification prose boundary FAILED:\n');
  for (const offender of offenders) {
    console.error(`  ${offender} requires notifications/labels.js`);
  }
  console.error(
    '\nOnly notifications/push.js may render notification text. Everywhere else,\n' +
      'send a code and let the device render it — see the header of\n' +
      'backend/src/notifications/labels.js for why that boundary exists.\n'
  );
  process.exit(1);
}

console.log('Notification prose boundary OK — only notifications/push.js renders text.');
