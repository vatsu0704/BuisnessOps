#!/usr/bin/env node
/**
 * Refuses an Android build whose Firebase file belongs to a different package.
 *
 * `google-services.json` is issued per package name and Gradle's Google Services
 * plugin matches on it exactly, so when the two disagree the build dies eighteen
 * seconds in, inside a task nobody has heard of:
 *
 *     Execution failed for task ':app:processDebugGoogleServices'.
 *     > No matching client found for package name 'com.kitnapay.app'
 *
 * which says what is wrong but not what to do about it — and the package name
 * changes exactly when nothing else looks broken, as it did at the KitnaPay
 * rebrand. This runs before Gradle starts and says both halves. `preandroid`
 * calls it, so `npm run android` stops at once, and `build:play` calls it too
 * rather than keeping a second copy of the same rule.
 *
 * **It checks the copy inside `android/` as well**, because replacing the file
 * at the repository root is only half the job: `expo prebuild` is what copies it
 * to `android/app/`, and Gradle reads that one. Replacing the root file and
 * building straight away gets the identical error from the stale copy.
 */
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..');
const ROOT_FILE = path.join(FRONTEND, 'google-services.json');
const ANDROID_FILE = path.join(FRONTEND, 'android', 'app', 'google-services.json');

/** The package Gradle will build as. app.config.js only overrides the file path. */
function androidPackage() {
  const app = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'app.json'), 'utf8'));
  return app.expo?.android?.package;
}

function packagesIn(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (json.client ?? []).map((c) => c.client_info?.android_client_info?.package_name).filter(Boolean);
}

/** Every reason this build would fail, as sentences. Empty means it is fine. */
function checkFirebasePackage(pkg = androidPackage()) {
  if (!pkg) return ['app.json has no expo.android.package.'];
  if (!fs.existsSync(ROOT_FILE)) {
    return [
      'frontend/google-services.json is missing, so no push notification would ever arrive.',
      'Docs/FIREBASE_SETUP.md is how to produce it.',
    ];
  }

  const root = packagesIn(ROOT_FILE);
  if (!root.includes(pkg)) {
    return [
      `frontend/google-services.json is for ${root.join(', ') || 'no package'}, but this app is ${pkg}.`,
      'Add an Android app for that package in the Firebase console — to the project you already have,',
      'keeping the old entry so push still reaches anyone on an old build — and replace the file with the',
      'one it hands you. Docs/FIREBASE_SETUP.md has the clicks. Then run `npx expo prebuild -p android`,',
      'because that is what copies the file into android/app/ and Gradle reads that copy, not this one.',
    ];
  }

  // android/ is generated, so a stale copy here is a different fault from the
  // one above and has a different fix: the root file is already right.
  if (fs.existsSync(ANDROID_FILE) && !packagesIn(ANDROID_FILE).includes(pkg)) {
    return [
      `frontend/google-services.json covers ${pkg}, but the copy in android/app/ does not.`,
      'Run `npx expo prebuild -p android` — that is what copies it across, and Gradle reads the copy.',
    ];
  }

  return [];
}

module.exports = { checkFirebasePackage, androidPackage };

if (require.main === module) {
  const problems = checkFirebasePackage();
  if (problems.length === 0) {
    console.log(`Firebase config OK — google-services.json covers ${androidPackage()}.`);
    process.exit(0);
  }
  console.error('\nThis Android build cannot work:\n');
  for (const line of problems) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}
