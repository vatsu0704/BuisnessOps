import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '@/theme';
import { spring } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = Omit<PressableProps, 'style'> & {
  title: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

export default function PrimaryButton({ title, loading, disabled, icon, style, onPress, ...rest }: Props) {
  const isDisabled = disabled || loading;
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
  }));

  function handlePress(event: GestureResponderEvent) {
    haptics.tap();
    onPress?.(event);
  }

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Pressable
        onPressIn={() => {
          pressed.value = withSpring(1, spring.snappy);
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, spring.snappy);
        }}
        onPress={handlePress}
        disabled={isDisabled}
        style={styles.pressable}
        {...rest}
      >
        <LinearGradient
          colors={isDisabled ? ['#C7C7CC', '#AEAEB2'] : ['#6366F1', '#4338CA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.text}>{title}</Text>
              {icon ? <Ionicons name={icon} size={18} color={colors.white} /> : null}
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: { borderRadius: radius.md, overflow: 'hidden' },
  gradient: {
    flexDirection: 'row',
    gap: spacing.sm,
    // Horizontal padding was missing entirely. It never showed while every
    // button was full width — the content is centred, so the space came from
    // the button being wider than its label. The moment one is sized by its
    // content instead, as the supply cart's tray does it, the label and its
    // icon sit flush against both edges with nothing around them. A button
    // has to look right at its own natural width, not only when something
    // else is stretching it.
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  text: { ...typography.button, color: colors.white },
});
