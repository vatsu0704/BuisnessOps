const { withAppBuildGradle } = require('@expo/config-plugins');

// Release builds ship signed with the debug key by default (Expo's template).
// If frontend/keystore.properties exists (gitignored - see CLAUDE.md's Native
// Android builds section), point the release build type at that keystore
// instead. Without the file, release builds fall back to the debug key so a
// fresh clone / CI still builds.
//
// This edits android/app/build.gradle by matching the template's exact text,
// so every edit is checked: when a React Native upgrade changes that text, the
// replacement would otherwise do nothing, the build would still succeed, and the
// "release" would be signed with the debug key - which Google Play refuses to
// accept, and which nothing before the upload would have pointed out. So a
// missed match stops prebuild with an error saying which piece to update here.
function replaceOrThrow(contents, search, replacement, what) {
  if (!contents.includes(search)) {
    throw new Error(
      `withReleaseSigning: could not find ${what} in android/app/build.gradle. ` +
        'The React Native template has changed; update plugins/withReleaseSigning.js ' +
        'to match it, or release builds will be signed with the debug key.'
    );
  }
  return contents.replace(search, replacement);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    const marker = 'releaseKeystoreProperties';
    if (cfg.modResults.contents.includes(marker)) {
      return cfg;
    }

    let contents = cfg.modResults.contents;

    contents = replaceOrThrow(
      contents,
      'apply plugin: "com.facebook.react"\n',
      `apply plugin: "com.facebook.react"\n\n` +
        `def releaseKeystorePropertiesFile = rootProject.file('../keystore.properties')\n` +
        `def releaseKeystoreProperties = null\n` +
        `if (releaseKeystorePropertiesFile.exists()) {\n` +
        `    releaseKeystoreProperties = new Properties()\n` +
        `    releaseKeystoreProperties.load(new FileInputStream(releaseKeystorePropertiesFile))\n` +
        `}\n`,
      'the react plugin line'
    );

    contents = replaceOrThrow(
      contents,
      `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`,
      `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        if (releaseKeystoreProperties != null) {
            release {
                storeFile file(releaseKeystoreProperties['storeFile'])
                storePassword releaseKeystoreProperties['storePassword']
                keyAlias releaseKeystoreProperties['keyAlias']
                keyPassword releaseKeystoreProperties['keyPassword']
            }
        }
    }`,
      'the signingConfigs block'
    );

    contents = replaceOrThrow(
      contents,
      `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`,
      `        release {
            // Signed with frontend/keystore.properties when present (see
            // withReleaseSigning.js); falls back to the debug key otherwise.
            signingConfig releaseKeystoreProperties != null ? signingConfigs.release : signingConfigs.debug`,
      "the release build type's signingConfig line"
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
};
