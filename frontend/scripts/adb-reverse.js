#!/usr/bin/env node
/**
 * Forwards the API and Metro ports to EVERY attached Android device.
 *
 * `EXPO_PUBLIC_API_URL` points at `http://localhost:4000/api`, which reaches
 * this machine only because `adb reverse` tunnels port 4000 over the adb
 * connection — over a cable or over Wi-Fi, it works the same either way.
 *
 * Two ports, and both matter once there is more than one device:
 *
 * - **4000, the API.** Expo knows nothing about it and never forwards it, so
 *   after a replug, an adb restart, or simply starting Metro fresh, the app
 *   loads perfectly and every request fails with "Cannot reach the BizIQ
 *   server". That is what this script originally existed for.
 * - **8081, Metro.** Expo *does* forward this — but only for the device it
 *   launched the app on. A second device that merely has the APK installed and
 *   is opened by hand has no forward, so it cannot download the JS bundle at
 *   all and sits on a "could not connect to development server" screen. Two
 *   devices at once is the normal way to test this app (a cashier places an
 *   order, the warehouse is notified), so the second device is not an edge
 *   case.
 *
 * Deliberately never fails the build: no device attached is the normal case
 * for `npm run web`, and a missing forward is a warning, not a reason to stop.
 */
const { execFileSync } = require('child_process');

const API_PORT = process.env.BIZIQ_API_PORT || '4000';
const METRO_PORT = process.env.RCT_METRO_PORT || '8081';
const PORTS = [API_PORT, METRO_PORT];
const isWindows = process.platform === 'win32';

function adb(args) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows });
}

try {
  const devices = adb(['devices'])
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'));

  if (devices.length === 0) {
    console.log(`adb-reverse: no device attached, skipping the ${PORTS.join(' and ')} forwards.`);
    process.exit(0);
  }

  // Every device gets the forward, named explicitly with `-s`.
  //
  // Without the `-s`, a bare `adb reverse` fails outright with "more than one
  // device/emulator" — which is the normal state for about a minute while
  // setting up wireless debugging, since the same phone appears twice (once as
  // a USB serial, once as an ip:port) until the cable comes out. The forward
  // then silently does not happen and the app reports that it cannot reach the
  // server, on a setup that looks entirely correct.
  const serials = devices.map((line) => line.split('\t')[0]);
  for (const serial of serials) {
    for (const port of PORTS) {
      adb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    }
    console.log(`adb-reverse: ${serial} → ports ${PORTS.join(', ')} on this machine.`);
  }
} catch (err) {
  console.warn(
    `adb-reverse: could not forward (${err.message.trim().split('\n')[0]}).\n` +
      `  If the app reports "Cannot reach the BizIQ server":\n` +
      `    adb -s <device> reverse tcp:${API_PORT} tcp:${API_PORT}\n` +
      `  If it cannot load the JS bundle at all:\n` +
      `    adb -s <device> reverse tcp:${METRO_PORT} tcp:${METRO_PORT}`
  );
}
