const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// On Android 12+ the OS draws its own splash before any app code runs, using
// android:windowSplashScreenBackground. expo-splash-screen 0.27 (SDK 51) never emits that
// attribute, so the system falls back to its own background - black on a dark-mode device.
// This writes the API-31 theme overlay that pins it to the brand colour instead.
module.exports = function withAndroid12SplashScreen(config, { backgroundColor }) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const valuesV31 = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'values-v31'
      );
      fs.mkdirSync(valuesV31, { recursive: true });
      fs.writeFileSync(
        path.join(valuesV31, 'styles.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="Theme.App.SplashScreen" parent="AppTheme">
    <item name="android:windowSplashScreenBackground">${backgroundColor}</item>
  </style>
</resources>
`
      );
      return cfg;
    },
  ]);
};
