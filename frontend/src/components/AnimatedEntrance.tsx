import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { duration, spring } from '@/theme/motion';

type Props = {
  children: ReactNode;
  delay?: number;
  distance?: number;
  /** Starting scale, settling to 1. Leave at 1 for the usual fade-and-rise. */
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
};

export default function AnimatedEntrance({ children, delay = 0, distance = 18, scaleFrom = 1, style }: Props) {
  const opacity = useSharedValue(0);
  const offset = useSharedValue(distance);
  const scale = useSharedValue(scaleFrom);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: duration.base }));
    offset.value = withDelay(delay, withSpring(0, spring.gentle));
    scale.value = withDelay(delay, withSpring(1, spring.gentle));
  }, [delay, offset, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }, { scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
