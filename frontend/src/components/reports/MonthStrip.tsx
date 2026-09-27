import { useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme';
import { haptics } from '@/utils/haptics';
import { monthKeyShortLabel } from '@/utils/date';

/**
 * Which month the grid is showing.
 *
 * A horizontal `FlatList` of chips sized by their own content, for the reason
 * `AttendanceStatusPicker` is a wrapping row: a control that divides a fixed
 * width between its options breaks as soon as there are more than three, and this
 * one has up to twelve. Here each chip is as wide as "Sep 2026" happens to be in
 * whatever language is selected, and the row scrolls.
 *
 * It scrolls to the end on mount and whenever the window changes, because the
 * month a person wants is almost always the most recent one and it is the one
 * furthest off screen.
 */
export default function MonthStrip({
  months,
  selected,
  onSelect,
}: {
  months: string[];
  selected: string;
  onSelect: (month: string) => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<FlatList<string>>(null);

  // Driven by `onContentSizeChange` rather than by an effect on the data.
  //
  // `scrollToEnd` in an effect fires as soon as the prop changes, which on a
  // horizontal list can be *before* it has measured its own content — and an
  // unmeasured list scrolls nowhere and reports no error, so the strip would
  // simply sit at the left some of the time and not others. The content-size
  // callback runs once the width is known, which is the earliest moment the
  // scroll can actually happen.
  //
  // The ref is what keeps it to once per range: that callback also fires on a
  // pull-to-refresh, and re-scrolling then would yank the strip back to the
  // right just as somebody was reading an earlier month.
  const scrolledFor = useRef(0);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={months}
      keyExtractor={(month) => month}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => {
        if (scrolledFor.current === months.length) return;
        scrolledFor.current = months.length;
        // Not animated: on first paint there is nothing to animate from, and a
        // visible slide on every range change reads as the screen reloading.
        listRef.current?.scrollToEnd({ animated: false });
      }}
      renderItem={({ item }) => {
        const isSelected = item === selected;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => {
              haptics.select();
              onSelect(item);
            }}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {monthKeyShortLabel(item, t)}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
  labelSelected: { color: colors.white },
});
