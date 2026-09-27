import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { categoryLabel } from '@/utils/expenseCategory';
import { colors, radius, spacing, typography } from '@/theme';
import type { ExpenseCategory } from '@/types/expense';

/**
 * What the money was spent on — requirement 10's category, and the thing that
 * makes "today I took ₹2,000 of milk" answerable about milk rather than about
 * spending in general.
 *
 * A wrapping row of chips sized by their own labels, for the reason set out in
 * `AttendanceStatusPicker`: this list is eight long before a business adds one
 * of its own, so anything that divides the width evenly between its items is
 * already broken, and would be broken hardest in the Indic translations where
 * every label runs longer than the English.
 *
 * The last chip adds a category, sitting in the row rather than above it: it is
 * the answer to "none of these is what I bought", which is a thought someone
 * has while reading the list, not before.
 */

type Props = {
  categories: ExpenseCategory[];
  value: string | null;
  onChange: (categoryId: string) => void;
  onAddCategory?: () => void;
  label?: string;
  testIDPrefix: string;
  style?: StyleProp<ViewStyle>;
};

export default function CategoryPicker({
  categories,
  value,
  onChange,
  onAddCategory,
  label,
  testIDPrefix,
  style,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={style}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {categories.map((category) => {
          const selected = value === category.id;
          return (
            <PressableScale
              key={category.id}
              testID={`${testIDPrefix}-${category.code ?? category.id}`}
              scaleTo={0.96}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(category.id)}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {categoryLabel(category, t)}
              </Text>
            </PressableScale>
          );
        })}

        {onAddCategory ? (
          <PressableScale
            testID={`${testIDPrefix}-add`}
            scaleTo={0.96}
            style={[styles.chip, styles.addChip]}
            onPress={onAddCategory}
          >
            <Ionicons name="add" size={15} color={colors.primary} />
            <Text style={[styles.label, styles.addLabel]}>{t('expenses.newCategory')}</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // No `flex` and no width: a chip is as wide as what is written on it, which
  // is the only sizing that survives a growing list in four languages.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  addChip: { borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primaryLight },
  label: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
  labelSelected: { color: colors.white },
  addLabel: { color: colors.primary },
});
