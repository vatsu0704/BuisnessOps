import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { spring } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

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
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={() => {
          pressed.value = withSpring(1, spring.snappy);
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, spring.snappy);
        }}
        onPress={handlePress}
        style={style}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
