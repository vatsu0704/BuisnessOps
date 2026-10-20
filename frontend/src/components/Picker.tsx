import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import OptionRow from '@/components/OptionRow';
import PressableScale from '@/components/PressableScale';
import SearchInput from '@/components/SearchInput';
import Sheet from '@/components/Sheet';
import type { PickerOption } from '@/types/picker';
import { SEARCH_FROM, filterByQuery, isSearchable } from '@/utils/optionSearch';
import { colors, radius, spacing, typography } from '@/theme';

export type AppPickerOption = PickerOption & { icon?: keyof typeof Ionicons.glyphMap };

type Props = {
  label: string;
  hideLabel?: boolean;
  options: AppPickerOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** The field's leading icon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Shown in the closed field when nothing is chosen. */
  placeholder?: string;
  /** Shown instead of the control when there is nothing to choose from. */
  emptyLabel?: string;
  disabled?: boolean;
  /**
   * How many options collapse this into a field and a sheet. `SEARCH_FROM` by
   * default. Raise it where the control is used at speed and a sheet would cost
   * more than a long row does; drop it to 1 where a field is wanted whatever the
   * count, as the language setting does.
   *
   * It does **not** decide whether the sheet has a box to type in: that follows
   * the real `SEARCH_FROM`, because a search box over four languages is clutter.
   */
  searchFrom?: number;
  testIDPrefix: string;
};

/**
 * Choose one of many.
 *
 * Under `SEARCH_FROM` options this is a stack of rows, all visible, one tap —
 * what the language setting and the branch choosers have always been. At or
 * above it, a field that opens a sheet with a box to type in, because a business
 * with two hundred branches cannot scan them. The switch lives here, so no
 * screen has to decide for itself.
 *
 * This is the shape Vatsal named: the language dropdown, which already argued
 * that four stacked rows was a fifth of Settings spent on a setting touched
 * once, and that it would only get worse as the list grew. It grew.
 */
export default function Picker({
  label,
  hideLabel,
  options,
  value,
  onChange,
  icon,
  placeholder,
  emptyLabel,
  disabled,
  searchFrom = SEARCH_FROM,
  testIDPrefix,
}: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  /**
   * A stored value with no option to match it still has to show, or a save
   * quietly wipes a branch's timezone because nobody would pick it today.
   */
  const shown = useMemo(() => {
    if (value === null || options.some((option) => option.value === value)) return options;
    return [{ value, label: value }, ...options];
  }, [options, value]);

  const selected = shown.find((option) => option.value === value) ?? null;
  const matches = useMemo(
    () => filterByQuery(shown, query, (option) => ({ primary: option.label, secondary: option.keywords })),
    [shown, query]
  );

  function pick(option: AppPickerOption) {
    if (option.disabled) return;
    setIsOpen(false);
    setQuery('');
    onChange(option.value);
  }

  function row(option: AppPickerOption, inSheet: boolean) {
    return (
      <OptionRow
        key={option.value}
        testID={`${testIDPrefix}-option-${option.value}`}
        title={option.label}
        description={option.disabled ? (option.disabledReason ?? option.description) : option.description}
        icon={option.icon}
        selected={option.value === value}
        onPress={() => (inSheet ? pick(option) : option.disabled ? undefined : onChange(option.value))}
      />
    );
  }

  if (options.length === 0 && emptyLabel) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  // --- The short form: every option visible, one tap ---
  if (!isSearchable(shown.length, searchFrom)) {
    return (
      <View style={styles.wrap}>
        {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
        <View style={styles.list}>{shown.map((option) => row(option, false))}</View>
      </View>
    );
  }

  // --- The long form: a field, and a sheet you type into ---
  return (
    <View style={styles.wrap}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}

      {/* The closed state says what is chosen and that it can be changed — the
          two things a dropdown owes the person looking at it. */}
      <PressableScale
        testID={`${testIDPrefix}-field`}
        scaleTo={0.99}
        style={[styles.field, disabled && styles.fieldDisabled]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? t('picker.choose')}`}
        onPress={disabled ? undefined : () => setIsOpen(true)}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.primary} /> : null}
        <View style={styles.fieldText}>
          <Text style={styles.fieldLabel}>{selected?.label ?? placeholder ?? t('picker.choose')}</Text>
          {selected?.description ? <Text style={styles.fieldNote}>{selected.description}</Text> : null}
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
      </PressableScale>

      <Sheet
        visible={isOpen}
        title={label}
        testID={`${testIDPrefix}-sheet`}
        onClose={() => {
          setIsOpen(false);
          setQuery('');
        }}
        header={
          isSearchable(shown.length) ? (
            <SearchInput
              testID={`${testIDPrefix}-search`}
              value={query}
              onChangeText={setQuery}
              placeholder={t('picker.typeToFind')}
            />
          ) : null
        }
      >
        <FlatList
          data={matches}
          keyExtractor={(option) => option.value}
          renderItem={({ item }) => row(item, true)}
          // Without this the first tap after typing only dismisses the keyboard,
          // which reads as the picker ignoring you.
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.sheetList}
          ListEmptyComponent={<Text style={styles.noMatch}>{t('picker.noMatches', { query })}</Text>}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  list: { gap: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  fieldDisabled: { opacity: 0.55 },
  // Takes the leftover width so a long branch name wraps inside the field
  // rather than pushing the chevron off the edge.
  fieldText: { flex: 1 },
  fieldLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  fieldNote: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  sheetList: { gap: spacing.xs, paddingBottom: spacing.sm },
  noMatch: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingVertical: spacing.md },
  empty: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
});
