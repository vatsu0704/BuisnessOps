import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { spring } from '@/theme/motion';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
};

export default function TabBarIcon({ name, color, focused }: Props) {
  const scale = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.12 : 1, spring.snappy);
    lift.value = withSpring(focused ? -2 : 0, spring.snappy);
  }, [focused, scale, lift]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: lift.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={name} size={22} color={color} />
    </Animated.View>
  );
}
