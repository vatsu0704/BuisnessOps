import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '@/theme';
import { duration, spring } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = {
  title: string;
  /** Shown under the title. This is what makes a list of choices readable without tapping each one. */
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * A full-width, single-select list row: icon, title, description, tick.
 *
 * The counterpart to `SegmentedOption`, which is a compact centred chip meant
 * for two or three side-by-side options and sets `flex: 1` so a row of them
 * divides the width evenly. That stops working somewhere around four: at six it
 * gave each chip roughly 40px and every label wrapped one character per line.
 *
 * Reach for this one instead whenever the choice has more than about three
 * options, or whenever each option needs a sentence to explain it — picking a
 * role is both. Rows stack, so an added option costs height rather than
 * breaking the layout, and the description sits beside the thing it describes
 * rather than under the whole group where it only ever describes the selection.
 *
 * Selection is a tinted background plus a filled tick, not a solid fill: with
 * six rows of body text a solid primary block is heavy, and the description has
 * to stay readable while selected.
 */
export default function OptionRow({ title, description, icon, selected, onPress, testID }: Props) {
  const progress = useSharedValue(selected ? 1 : 0);
  const tick = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: duration.quick });
    tick.value = withSpring(selected ? 1 : 0, spring.snappy);
  }, [selected, progress, tick]);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.primaryLight]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.primary]),
  }));

  const iconWrapStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.background, colors.primary]),
  }));

  const markStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', colors.primary]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.primary]),
  }));

  // Scale rather than opacity alone, so the tick lands with the row instead of
  // fading in over it. Transform-based, so it stays on the UI thread.
  const tickStyle = useAnimatedStyle(() => ({
    opacity: tick.value,
    transform: [{ scale: tick.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, containerStyle]}>
      <Pressable
        testID={testID}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={description ? `${title}. ${description}` : title}
        style={styles.pressable}
        onPress={() => {
          haptics.select();
          onPress();
        }}
      >
        {icon ? (
          <Animated.View style={[styles.iconWrap, iconWrapStyle]}>
            <Ionicons name={icon} size={17} color={selected ? colors.white : colors.textSecondary} />
          </Animated.View>
        ) : null}

        <View style={styles.text}>
          <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>

        <Animated.View style={[styles.mark, markStyle]}>
          <Animated.View style={tickStyle}>
            <Ionicons name="checkmark" size={13} color={colors.white} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1.5, borderRadius: radius.lg, overflow: 'hidden' },
  pressable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Takes the leftover width so a long description wraps inside the row rather
  // than pushing the tick off the edge.
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  titleSelected: { color: colors.primaryDark },
  description: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  mark: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudged down to sit on the title's optical centre rather than the row's,
    // which is off once a two-line description makes the row tall.
    marginTop: 1,
  },
});
