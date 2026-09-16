import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '@/theme';
import { duration } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

// the animated border is the focus indicator; the browser's own ring would double up
const webOutlineReset =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : undefined;

type Props = Omit<TextInputProps, 'secureTextEntry' | 'placeholderTextColor'> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
  /** small muted note shown at the right end of the label row */
  hint?: string;
};

export default function FormInput({ label, icon, isPassword, hint, onFocus, onBlur, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [secure, setSecure] = useState(isPassword ?? false);
  const focusProgress = useSharedValue(0);

  const animatedFieldStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focusProgress.value, [0, 1], [colors.border, colors.primary]),
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(focusProgress.value, [0, 1], ['#FAFAFB', colors.primaryLight]),
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>

      <Animated.View style={[styles.field, animatedFieldStyle]}>
        <Animated.View style={[styles.iconBox, animatedIconStyle]}>
          <Ionicons name={icon} size={18} color={focused ? colors.primary : colors.textTertiary} />
        </Animated.View>

        <TextInput
          style={[styles.input, webOutlineReset, style]}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={isPassword ? secure : false}
          onFocus={(e) => {
            setFocused(true);
            focusProgress.value = withTiming(1, { duration: duration.quick });
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            focusProgress.value = withTiming(0, { duration: duration.quick });
            onBlur?.(e);
          }}
          {...rest}
        />

        {isPassword ? (
          <Pressable
            style={styles.eyeBox}
            onPress={() => {
              haptics.select();
              setSecure((s) => !s);
            }}
            hitSlop={6}
          >
            <Ionicons name={secure ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: { ...typography.label, color: colors.text },
  hint: { fontSize: 12, color: colors.textTertiary, fontWeight: '500' },
  field: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    minHeight: 52,
  },
  iconBox: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15.5,
    color: colors.text,
  },
  eyeBox: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
});
