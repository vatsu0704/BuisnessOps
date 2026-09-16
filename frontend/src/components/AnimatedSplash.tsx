import { useEffect, useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import BrandMark from '@/components/BrandMark';
import { colors, spacing } from '@/theme';
import { duration } from '@/theme/motion';

// long enough for the mark's bars-then-spark sequence to read
const MIN_VISIBLE_MS = 1900;

type Props = {
  ready: boolean;
  onFinish: () => void;
};

export default function AnimatedSplash({ ready, onFinish }: Props) {
  const startedAt = useRef(Date.now());
  const fade = useSharedValue(1);
  const wordmark = useSharedValue(0);

  useEffect(() => {
    // hand off from the native splash only once this screen is on top of it
    void SplashScreen.hideAsync().catch(() => {});
    wordmark.value = withDelay(700, withTiming(1, { duration: duration.slow }));
  }, [wordmark]);

  useEffect(() => {
    if (!ready) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(() => {
      fade.value = withTiming(0, { duration: 420 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      });
    }, remaining);
    return () => clearTimeout(timer);
  }, [ready, fade, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 12 }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, containerStyle]} pointerEvents="none">
      <LinearGradient
        colors={['#6366F1', '#4338CA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <BrandMark size={226} tile={false} />
      <Animated.View style={wordmarkStyle}>
        <Text style={styles.wordmark}>BizIQ</Text>
        <Text style={styles.tagline}>Ask your business anything</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  wordmark: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.xl,
    letterSpacing: 0.3,
  },
  tagline: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
