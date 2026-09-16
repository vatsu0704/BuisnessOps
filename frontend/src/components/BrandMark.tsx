import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, shadow } from '@/theme';
import { spring } from '@/theme/motion';

// Geometry mirrors assets/icon.png so the in-app mark and the app icon are the same drawing.
const BASELINE = 0.1758;
const BAR_WIDTH = 0.127;
const BARS = [
  { left: 0.1953, height: 0.2148 },
  { left: 0.376, height: 0.3418 },
  { left: 0.5566, height: 0.4688 },
];
const SPARKS = [
  { cx: 0.7275, cy: 0.2773, r: 0.0762, delay: 480, twinkle: false },
  { cx: 0.625, cy: 0.208, r: 0.0332, delay: 620, twinkle: true },
];

// 4-point AI spark on a 0..100 viewBox
function sparkPath(ratio = 0.26): string {
  const c = 50;
  const R = 50;
  const r = R * ratio;
  return [
    `M ${c} ${c - R}`,
    `C ${c} ${c - r}, ${c + r} ${c}, ${c + R} ${c}`,
    `C ${c + r} ${c}, ${c} ${c + r}, ${c} ${c + R}`,
    `C ${c} ${c + r}, ${c - r} ${c}, ${c - R} ${c}`,
    `C ${c - r} ${c}, ${c} ${c - r}, ${c} ${c - R}`,
    'Z',
  ].join(' ');
}

const SPARK_PATH = sparkPath();

function Bar({ size, left, height, delay }: { size: number; left: number; height: number; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.gentle));
  }, [delay, progress]);

  const width = size * BAR_WIDTH;
  const target = size * height;

  const animatedStyle = useAnimatedStyle(() => ({
    height: width + (target - width) * progress.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: size * left,
          bottom: size * BASELINE,
          width,
          borderRadius: width / 2,
          backgroundColor: colors.white,
        },
        animatedStyle,
      ]}
    />
  );
}

function Spark({
  size,
  cx,
  cy,
  r,
  delay,
  twinkle,
}: {
  size: number;
  cx: number;
  cy: number;
  r: number;
  delay: number;
  twinkle: boolean;
}) {
  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, spring.snappy));
    if (twinkle) {
      pulse.value = withDelay(
        delay + 400,
        withRepeat(withTiming(0.55, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true)
      );
    }
  }, [delay, progress, pulse, twinkle]);

  const diameter = size * r * 2;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value * (twinkle ? pulse.value : 1),
    transform: [{ scale: progress.value }, { rotate: `${(1 - progress.value) * -120}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: size * (cx - r),
          top: size * (cy - r),
          width: diameter,
          height: diameter,
        },
        animatedStyle,
      ]}
    >
      <Svg width={diameter} height={diameter} viewBox="0 0 100 100">
        <Path d={SPARK_PATH} fill={colors.white} />
      </Svg>
    </Animated.View>
  );
}

type Props = { size?: number; delay?: number; tile?: boolean };

export default function BrandMark({ size = 56, delay = 0, tile = true }: Props) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(delay, withSpring(1, spring.gentle));
    opacity.value = withDelay(delay, withTiming(1, { duration: 220 }));
  }, [delay, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.wrap,
        { width: size, height: size },
        tile && { borderRadius: size * 0.3, ...shadow.md },
        animatedStyle,
      ]}
    >
      {tile ? (
        <LinearGradient
          colors={['#6366F1', '#4338CA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: size * 0.3 }]}
        />
      ) : null}
      <View style={StyleSheet.absoluteFill}>
        {BARS.map((bar, index) => (
          <Bar key={bar.left} size={size} left={bar.left} height={bar.height} delay={delay + 160 + index * 90} />
        ))}
        {SPARKS.map((s) => (
          <Spark
            key={s.cx}
            size={size}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            delay={delay + s.delay}
            twinkle={s.twinkle}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
});
