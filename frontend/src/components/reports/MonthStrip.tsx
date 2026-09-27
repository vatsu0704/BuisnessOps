import { useEffect, useRef } from 'react';
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

  // Keyed on the COUNT, not the array. A pull-to-refresh replaces the report
  // object and therefore the array, and re-scrolling on that would yank the
  // strip back to the right just as somebody was reading an earlier month.
  // Only a change of range changes how many months there are.
  useEffect(() => {
    // Not animated: on first paint there is nothing to animate from, and a
    // visible slide on every range change reads as the screen reloading.
    listRef.current?.scrollToEnd({ animated: false });
  }, [months.length]);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={months}
      keyExtractor={(month) => month}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
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
