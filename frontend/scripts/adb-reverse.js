#!/usr/bin/env node
/**
 * Forwards the API port to any attached Android device.
 *
 * `EXPO_PUBLIC_API_URL` points at `http://localhost:4000/api`, which reaches
 * this machine only because `adb reverse` tunnels port 4000 over the USB
 * cable. Expo sets up the same forward for Metro on 8081 itself, but it knows
 * nothing about the API port — so after a replug, an adb restart, or simply
 * starting Metro fresh, 8081 comes back and 4000 does not. The app then loads
 * perfectly and every request fails with "Cannot reach the BizIQ server".
 *
 * Running this from the `start`/`android` scripts closes that gap.
 *
 * Deliberately never fails the build: no device attached is the normal case
 * for `npm run web`, and a missing forward is a warning, not a reason to stop.
 */
const { execFileSync } = require('child_process');

const PORT = process.env.BIZIQ_API_PORT || '4000';
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
    console.log(`adb-reverse: no device attached, skipping port ${PORT} forward.`);
    process.exit(0);
  }

  adb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
  console.log(`adb-reverse: forwarding device port ${PORT} to this machine.`);
} catch (err) {
  console.warn(
    `adb-reverse: could not forward port ${PORT} (${err.message.trim().split('\n')[0]}).\n` +
      `  If the app reports "Cannot reach the BizIQ server", run:  adb reverse tcp:${PORT} tcp:${PORT}`
  );
}
