#!/usr/bin/env node
/**
 * Builds the Android App Bundle (.aab) that Google Play takes.
 *
 *   npm run build:play -- --api-url https://api.example.in/api
 *
 * Everything this checks is a mistake that a plain `./gradlew bundleRelease`
 * makes silently, producing a file that builds, installs and is wrong:
 *
 *  - **The API address.** `EXPO_PUBLIC_API_URL` is compiled into the bundle, so
 *    a release built while `.env` still says `localhost` calls the phone itself,
 *    forever. The address is taken from the command line and set in this
 *    process's environment, which Expo honours over `.env` — so `.env` is
 *    neither read for it nor edited. It must be https, and end in `/api`,
 *    because the app finds the privacy policy by stripping that suffix.
 *  - **The signing key.** Without `keystore.properties`, or with one naming a
 *    file that is not there, the release is signed with the debug key — and
 *    Play refuses a debug-signed upload only after you have filled in the form.
 *  - **The Firebase file.** `google-services.json` must belong to the package
 *    in `app.json`. Gradle does refuse a mismatch, but eighteen seconds in and
 *    from a task nobody has heard of, so `scripts/check-firebase-package.js`
 *    says it first and says what to do — and every Android build runs it, not
 *    only this one.
 *  - **The CPU architectures.** Day-to-day debug builds are arm64-only (see
 *    plugins/withAndroidArchitectures.js); a Play bundle must carry every ABI
 *    real phones use. Passed to Gradle as `-P`, so it does not touch the
 *    debug setting in gradle.properties.
 *
 * After the build it opens the result and checks the URL really is in the
 * bundle, `localhost` really is not, and the certificate is not Android's debug
 * one. See Docs/PLAY_STORE_RELEASE.md (B6) for where the file then goes.
 *
 * Starts no dev server, so it is safe to run while Metro is not running — and
 * pointless while it is, since Gradle and Metro share nothing here.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { checkFirebasePackage } = require('./check-firebase-package');

const FRONTEND = path.join(__dirname, '..');
const ANDROID = path.join(FRONTEND, 'android');
const IS_WINDOWS = process.platform === 'win32';
const RELEASE_ARCHITECTURES = ['armeabi-v7a', 'arm64-v8a', 'x86_64'];
const AAB = path.join(ANDROID, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

function refuse(message) {
  console.error(`\nbuild:play refused: ${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`\n▶ ${message}`);
}

function readArg(name) {
  const flag = `--${name}`;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) return argv[i + 1];
    if (argv[i].startsWith(`${flag}=`)) return argv[i].slice(flag.length + 1);
  }
  return undefined;
}

function checkApiUrl(raw) {
  if (!raw) {
    refuse('give the hosted API address: npm run build:play -- --api-url https://api.example.in/api');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse(`"${raw}" is not a URL.`);
  }
  if (url.protocol !== 'https:') {
    refuse(`the API address must be https — release builds do not allow plain http. Got ${raw}`);
  }
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
    refuse(`${url.hostname} is a local address; a phone from the Play Store cannot reach it.`);
  }
  if (!/\/api\/?$/.test(url.pathname)) {
    refuse(`the address must end in /api (the app finds /privacy by removing it). Got ${raw}`);
  }
  return raw.replace(/\/$/, '');
}

function readProperties(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([^#!=\s][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function checkKeystore() {
  const file = path.join(FRONTEND, 'keystore.properties');
  if (!fs.existsSync(file)) {
    refuse('frontend/keystore.properties is missing, so the release would be signed with the debug key.');
  }
  const props = readProperties(file);
  for (const key of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
    if (!props[key]) refuse(`keystore.properties has no ${key}.`);
  }
  // Gradle's file() in the app module resolves a relative path from android/app.
  const storeFile = path.resolve(ANDROID, 'app', props.storeFile);
  if (!fs.existsSync(storeFile)) {
    refuse(`the keystore keystore.properties names does not exist: ${storeFile}`);
  }
  return storeFile;
}

function checkFirebase(androidPackage) {
  const problems = checkFirebasePackage(androidPackage);
  if (problems.length) refuse(problems.join(' '));
}

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: IS_WINDOWS, ...options });
  if (result.status !== 0) {
    console.error(`\n${command} ${args.join(' ')} failed (exit ${result.status}).`);
    process.exit(result.status || 1);
  }
}

/** keytool and jar from the JDK Gradle is pinned to, else JAVA_HOME, else PATH. */
function jdkTool(name) {
  const candidates = [];
  const gradleProps = path.join(ANDROID, 'gradle.properties');
  if (fs.existsSync(gradleProps)) {
    const home = readProperties(gradleProps)['org.gradle.java.home'];
    if (home) candidates.push(path.join(home, 'bin', name));
  }
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', name));
  const exe = IS_WINDOWS ? '.exe' : '';
  const found = candidates.map((c) => c + exe).find((c) => fs.existsSync(c));
  return found ?? name;
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    refuse(`${path.basename(command)} ${args[0]} failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout;
}

function findFile(dir, name, filter) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findFile(full, name, filter));
    else if (entry.name === name && filter(full)) found.push(full);
  }
  return found;
}

function verifyBundle(apiUrl) {
  step('Checking the built bundle');
  if (!fs.existsSync(AAB)) refuse(`Gradle finished but ${AAB} is not there.`);

  // The JS bundle Gradle compiled for this release. Hermes bytecode keeps
  // string literals as plain bytes, so the inlined address can be searched for.
  const generated = path.join(ANDROID, 'app', 'build', 'generated', 'assets');
  const bundles = findFile(generated, 'index.android.bundle', (f) => /release/i.test(f));
  if (bundles.length === 0) refuse(`no release index.android.bundle under ${generated}.`);
  const js = fs.readFileSync(bundles[0]).toString('latin1');
  if (!js.includes(apiUrl)) {
    refuse(`the bundle does not contain ${apiUrl} — EXPO_PUBLIC_API_URL did not reach it.`);
  }
  if (js.includes('localhost:4000')) {
    refuse('the bundle still contains localhost:4000 — it would call the phone itself.');
  }
  console.log(`  ✓ the bundle calls ${apiUrl}, and never localhost`);

  const cert = capture(jdkTool('keytool'), ['-printcert', '-jarfile', AAB]);
  if (/CN=Android Debug/i.test(cert)) refuse('the bundle is signed with the Android debug key.');
  const owner = /Owner:\s*(.+)/.exec(cert)?.[1]?.trim() ?? 'unknown';
  console.log(`  ✓ signed by ${owner}`);

  const entries = capture(jdkTool('jar'), ['tf', AAB]);
  const missing = RELEASE_ARCHITECTURES.filter((abi) => !entries.includes(`base/lib/${abi}/`));
  if (missing.length) refuse(`the bundle has no native code for ${missing.join(', ')}.`);
  console.log(`  ✓ native code for ${RELEASE_ARCHITECTURES.join(', ')}`);
}

function main() {
  const apiUrl = checkApiUrl(readArg('api-url'));

  const appJson = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'app.json'), 'utf8')).expo;
  const androidPackage = appJson.android?.package;
  const versionCode = appJson.android?.versionCode;
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    refuse('app.json has no android.versionCode. Play needs a whole number that goes up with every upload.');
  }

  checkFirebase(androidPackage);
  const keystore = checkKeystore();

  console.log(`Building ${androidPackage} ${appJson.version} (versionCode ${versionCode})`);
  console.log(`  API       ${apiUrl}`);
  console.log(`  keystore  ${keystore}`);
  console.log(`  ABIs      ${RELEASE_ARCHITECTURES.join(', ')}`);
  console.log(`  Remember: versionCode must be higher than the last one uploaded to Play.`);

  const env = { ...process.env, EXPO_PUBLIC_API_URL: apiUrl, NODE_ENV: 'production' };

  step('Syncing android/ with app.json (expo prebuild)');
  run('npx', ['expo', 'prebuild', '-p', 'android', '--no-install'], { cwd: FRONTEND, env });

  step('Building the release bundle (gradle bundleRelease)');
  // `.\` as well as `./`: with NoDefaultCurrentDirectoryInExePath set (a Windows
  // hardening option some shells and CI images turn on), cmd.exe no longer looks
  // in the current directory for a bare `gradlew.bat`.
  run(
    IS_WINDOWS ? '.\\gradlew.bat' : './gradlew',
    ['bundleRelease', `-PreactNativeArchitectures=${RELEASE_ARCHITECTURES.join(',')}`, '--console=plain'],
    { cwd: ANDROID, env }
  );

  verifyBundle(apiUrl);

  const size = (fs.statSync(AAB).size / (1024 * 1024)).toFixed(1);
  console.log(`\nReady for Play: ${AAB} (${size} MB)\n`);
}

main();
