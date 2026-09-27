import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { spring } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

/**
 * The pressable itself is animated — `style` and the press-scale land on the
 * *same* node, so this can be laid out as a flex or grid child.
 *
 * It used to wrap a Pressable in an unstyled `Animated.View` and put `style` on
 * the inner one. That reads as harmless, and is fatal for any caller sizing it
 * relative to its parent: the wrapper had no width of its own, so a
 * `width: '31%'` on the inner Pressable resolved against an indefinite width,
 * collapsed to the minimum intrinsic size, and rendered the counter's product
 * tiles one character per line. `flex: 1` failed the same way, silently.
 *
 * Keep it one node. Every other animated component here (`AnimatedEntrance`,
 * `SegmentedOption`) already puts the caller's style on the element that
 * actually participates in layout.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
};

export default function PressableScale({ children, style, scaleTo = 0.95, onPress, ...rest }: Props) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
  }));

  function handlePress(event: GestureResponderEvent) {
    haptics.tap();
    onPress?.(event);
  }

  return (
    <AnimatedPressable
      onPressIn={() => {
        pressed.value = withSpring(1, spring.snappy);
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, spring.snappy);
      }}
      onPress={handlePress}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
