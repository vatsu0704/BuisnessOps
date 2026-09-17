const { withAppBuildGradle } = require('@expo/config-plugins');

// Release builds ship signed with the debug key by default (Expo's template).
// If frontend/keystore.properties exists (gitignored - see CLAUDE.md's Native
// Android builds section), point the release build type at that keystore
// instead. Without the file, release builds silently fall back to the debug
// key so a fresh clone / CI still builds.
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    const marker = 'releaseKeystoreProperties';
    if (cfg.modResults.contents.includes(marker)) {
      return cfg;
    }

    cfg.modResults.contents = cfg.modResults.contents.replace(
      'apply plugin: "com.facebook.react"\n',
      `apply plugin: "com.facebook.react"\n\n` +
        `def releaseKeystorePropertiesFile = rootProject.file('../keystore.properties')\n` +
        `def releaseKeystoreProperties = null\n` +
        `if (releaseKeystorePropertiesFile.exists()) {\n` +
        `    releaseKeystoreProperties = new Properties()\n` +
        `    releaseKeystoreProperties.load(new FileInputStream(releaseKeystorePropertiesFile))\n` +
        `}\n`
    );

    cfg.modResults.contents = cfg.modResults.contents.replace(
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
    }`
    );

    cfg.modResults.contents = cfg.modResults.contents.replace(
      `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`,
      `        release {
            // Signed with frontend/keystore.properties when present (see
            // withReleaseSigning.js); falls back to the debug key otherwise.
            signingConfig releaseKeystoreProperties != null ? signingConfigs.release : signingConfigs.debug`
    );

    return cfg;
  });
};
