import { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import AnimatedLogo from '@/components/AnimatedLogo';
import art from '@/constants/brandMark.json';
import { colors, spacing } from '@/theme';
import { duration } from '@/theme/motion';

// Long enough for the mark to draw and the name to be read before the app takes
// over, and short enough that a fast cold start does not feel held back.
const MIN_VISIBLE_MS = 1800;
// A splash that never ends is worse than one that ends early: if bootstrap hangs
// — an unreachable server on a slow network — go anyway and let the app say so.
const MAX_VISIBLE_MS = 3000;

type Props = {
  ready: boolean;
  onFinish: () => void;
};

/**
 * Takes over from the native splash: the same white, and the mark at the same
 * place and width, so the hand-over does not jump.
 *
 * That width is fixed in dp, not a share of the screen. Since SDK 54 the only
 * native splash is Android's own (12+), which draws its icon at a fixed size
 * whatever the phone — `splashMarkWidth` in constants/brandMark.json says what
 * that comes to, and `generate-brand-assets.js` refuses to render if that stops
 * agreeing with `app.json`'s `imageWidth`.
 *
 * ## Why the background is still white
 *
 * Navy would be the stronger first impression, and the palette is navy-led. It
 * was not taken because the mark is two colours: on navy the K disappears and
 * the splash would have to show a white silhouette, which is the one moment the
 * actual logo matters most. Switching is a background here, the same colour in
 * `app.json`'s `expo-splash-screen` block, `androidStatusBar.barStyle` to
 * `light-content`, and a white variant of the mark — all four together, or the
 * hand-over flashes.
 *
 * The mark draws itself in at the centre, then the whole lockup rises as the
 * name and tagline appear beneath it, so it ends up centred as a unit; once the
 * app is ready it fades away over the first screen.
 */
export default function AnimatedSplash({ ready, onFinish }: Props) {
  const { t } = useTranslation();
  const markWidth = art.splashMarkWidth;
  const startedAt = useRef(Date.now());
  const fade = useSharedValue(1);
  // Half the height the name block adds below the mark, measured once it lays out.
  const lift = useSharedValue(0);
  const reveal = useSharedValue(0);

  useEffect(() => {
    // Hand off from the native splash only once this screen is on top of it.
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const elapsed = () => Date.now() - startedAt.current;
    const leave = () => {
      fade.value = withTiming(0, { duration: duration.slow }, (finished) => {
        if (finished) runOnJS(onFinish)();
      });
    };
    const wait = ready ? Math.max(0, MIN_VISIBLE_MS - elapsed()) : Math.max(0, MAX_VISIBLE_MS - elapsed());
    const timer = setTimeout(leave, wait);
    return () => clearTimeout(timer);
  }, [ready, fade, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  // Starts lowered by `lift`, which puts the mark itself at the screen's centre.
  const lockupStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value * (1 - reveal.value) }, { scale: 1 + (1 - fade.value) * 0.04 }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, containerStyle]} pointerEvents="none">
      <AnimatedLogo
        size={markWidth}
        style={lockupStyle}
        onNameHeight={(value) => {
          lift.value = value;
          reveal.value = withTiming(1, { duration: duration.base });
        }}
      >
        <Text style={styles.tagline}>{t('splash.tagline')}</Text>
      </AnimatedLogo>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // app.json's expo-splash-screen background is this same white (#FFFFFF).
  container: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  tagline: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
});
