const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// On Android 12+ the OS draws its own splash before any app code runs: an icon on
// android:windowSplashScreenBackground. expo-splash-screen 0.27 (SDK 51) emits neither, so
// the system falls back to its own background - black on a dark-mode device - and to the
// whole launcher icon. This writes the API-31 theme overlay that pins both: the brand
// background, and as the icon the adaptive icon's foreground, which is the bare mark already
// sized inside the safe circle the splash masks it to. So the first frame a person sees is
// the same white and the same mark the JS splash then animates, not a different picture.
module.exports = function withAndroid12SplashScreen(
  config,
  { backgroundColor, icon = '@mipmap/ic_launcher_foreground' }
) {
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
    <item name="android:windowSplashScreenAnimatedIcon">${icon}</item>
  </style>
</resources>
`
      );
      return cfg;
    },
  ]);
};
