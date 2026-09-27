/**
 * `app.json` stays the source of truth for the config. This file exists for the
 * one value a static JSON file cannot express.
 *
 * `frontend/google-services.json` is gitignored — it belongs to a Firebase
 * project, not to the repository — and **EAS Build uploads only the files git
 * tracks**, so an EAS build dies in prebuild with "google-services.json is
 * missing" however plainly the file sits on this machine. EAS supplies it
 * instead as a file-type environment variable, whose value on the builder is
 * the path the file was written to. `GOOGLE_SERVICES_JSON` is the name to
 * create on expo.dev — see `Docs/FIREBASE_SETUP.md`.
 *
 * Local builds are unaffected: the variable is unset here, so the literal path
 * from `app.json` is used and `expo prebuild` / `./gradlew assembleRelease`
 * behave exactly as before.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
