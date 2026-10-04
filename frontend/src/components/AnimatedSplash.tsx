import { useEffect, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import BrandMark from '@/components/BrandMark';
import Wordmark from '@/components/Wordmark';
import art from '@/constants/brandMark.json';
import { colors, spacing } from '@/theme';
import { duration, spring, step } from '@/theme/motion';

// The name comes in as the K's arm settles (BrandMark starts the arm at step(6)).
const NAME_AT = step(9);
// Long enough for the mark to draw and the name to be read before the app takes over.
const MIN_VISIBLE_MS = 1800;
// On a tablet the share of the width would make a poster of it.
const MAX_MARK_WIDTH = 220;
// The logo's proportions, as fractions of the mark's width: the name runs about
// 1.4× as wide as the mark ("HisabKitab" in the wordmark's weight is ~4.75em, so a
// font size of 0.295 of it), with a gap of about 9% between them.
const NAME_SIZE = 0.295;
const NAME_GAP = 0.09;

type Props = {
  ready: boolean;
  onFinish: () => void;
};

/**
 * Takes over from the native splash: the same white, and the mark at the same
 * place and width (the screen-width share in constants/brandMark.json), so the
 * hand-over does not jump. The mark draws itself in at the centre, then the
 * whole lockup rises as the name and tagline appear beneath it, so it ends up
 * centred as a unit; once the app is ready it fades away over the first screen.
 */
export default function AnimatedSplash({ ready, onFinish }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const markWidth = Math.min(width * art.splashShare, MAX_MARK_WIDTH);
  const gap = Math.round(markWidth * NAME_GAP);
  const startedAt = useRef(Date.now());
  const reveal = useSharedValue(0);
  const fade = useSharedValue(1);
  // Half the height the name block adds below the mark, measured once it lays out.
  const lift = useSharedValue(0);

  useEffect(() => {
    // hand off from the native splash only once this screen is on top of it
    void SplashScreen.hideAsync().catch(() => {});
    reveal.value = withDelay(NAME_AT, withSpring(1, spring.gentle));
  }, [reveal]);

  useEffect(() => {
    if (!ready) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(() => {
      fade.value = withTiming(0, { duration: duration.slow }, (finished) => {
        if (finished) runOnJS(onFinish)();
      });
    }, remaining);
    return () => clearTimeout(timer);
  }, [ready, fade, onFinish]);

  function measureName(event: LayoutChangeEvent) {
    lift.value = (event.nativeEvent.layout.height + gap) / 2;
  }

  const containerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  // Starts lowered by `lift`, which puts the mark itself at the screen's centre.
  const lockupStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value * (1 - reveal.value) }, { scale: 1 + (1 - fade.value) * 0.04 }],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.value),
    transform: [{ translateY: (1 - reveal.value) * 14 }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, containerStyle]} pointerEvents="none">
      <Animated.View style={[styles.lockup, lockupStyle]}>
        <BrandMark width={markWidth} />
        <Animated.View style={[styles.name, { marginTop: gap }, nameStyle]} onLayout={measureName}>
          <Wordmark size={Math.round(markWidth * NAME_SIZE)} align="center" />
          <Text style={styles.tagline}>{t('splash.tagline')}</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // app.json's splash and the Android 12 plugin use this same white (#FFFFFF).
  container: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  lockup: { alignItems: 'center' },
  name: { alignItems: 'center', paddingHorizontal: spacing.xl },
  tagline: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
