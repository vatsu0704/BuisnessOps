import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '@/theme';
import { duration, spring } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = {
  title: string;
  caption?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

export default function SegmentedOption({ title, caption, icon, selected, onPress, testID }: Props) {
  const progress = useSharedValue(selected ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: duration.quick });
    if (selected) {
      pop.value = withSequence(withSpring(1.04, spring.snappy), withSpring(1, spring.snappy));
    }
  }, [selected, progress, pop]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.primary]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.primary]),
    transform: [{ scale: pop.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <Pressable
        testID={testID}
        style={styles.pressable}
        onPress={() => {
          haptics.select();
          onPress();
        }}
      >
        {icon ? (
          <Ionicons name={icon} size={16} color={selected ? colors.white : colors.textSecondary} />
        ) : null}
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {caption ? (
          <Text style={[styles.caption, selected && styles.captionSelected]}>{caption}</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, overflow: 'hidden' },
  pressable: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, alignItems: 'center', gap: 2 },
  title: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center' },
  titleSelected: { color: colors.white },
  caption: { fontSize: 11, color: colors.textTertiary, textAlign: 'center' },
  captionSelected: { color: 'rgba(255,255,255,0.82)' },
});
