import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import OptionRow from '@/components/OptionRow';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import SearchInput from '@/components/SearchInput';
import SegmentedOption from '@/components/SegmentedOption';
import Sheet from '@/components/Sheet';
import type { AppPickerOption } from '@/components/Picker';
import { SEARCH_FROM, filterByQuery, isSearchable } from '@/utils/optionSearch';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  label: string;
  hideLabel?: boolean;
  options: AppPickerOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
  searchFrom?: number;
  testIDPrefix: string;
};

/**
 * Several of many — Invite member's branch grants.
 *
 * Under `SEARCH_FROM` it is the wrapping grid of chips it has always been. Past
 * that it is a field saying how many are chosen, opening a sheet with a box to
 * type into, and the chosen ones listed under the field so they can be taken off
 * without opening anything.
 *
 * A sibling of `Picker` rather than a flag on it: the value is a list, the
 * closed field is a count and some pills rather than one label, and picking must
 * **not** close the sheet — which is the whole interaction for a single choice.
 */
export default function MultiPicker({
  label,
  hideLabel,
  options,
  value,
  onChange,
  emptyLabel,
  searchFrom = SEARCH_FROM,
  testIDPrefix,
}: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const matches = useMemo(
    () => filterByQuery(options, query, (option) => ({ primary: option.label, secondary: option.keywords })),
    [options, query]
  );
  const chosen = options.filter((option) => value.includes(option.value));

  function toggle(optionValue: string) {
    onChange(value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue]);
  }

  if (options.length === 0) {
    return emptyLabel ? <Text style={styles.empty}>{emptyLabel}</Text> : null;
  }

  if (!isSearchable(options.length, searchFrom)) {
    return (
      <View>
        {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
        <View style={styles.grid}>
          {options.map((option) => (
            <View key={option.value} style={styles.cell}>
              <SegmentedOption
                testID={`${testIDPrefix}-option-${option.value}`}
                title={option.label}
                caption={option.description}
                icon={option.icon}
                selected={value.includes(option.value)}
                onPress={() => toggle(option.value)}
              />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}

      <PressableScale
        testID={`${testIDPrefix}-field`}
        scaleTo={0.99}
        style={styles.field}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen.length}`}
        onPress={() => setIsOpen(true)}
      >
        <Ionicons name="storefront-outline" size={18} color={colors.primary} />
        <Text style={styles.fieldText}>
          {chosen.length === 0
            ? t('picker.none')
            : t('picker.selectedCount', { selected: chosen.length, total: options.length })}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
      </PressableScale>

      {/* Chosen branches stay readable without opening the sheet, and each one
          comes off where it sits. */}
      {chosen.length > 0 ? (
        <View style={styles.pills}>
          {chosen.map((option) => (
            <Pill
              key={option.value}
              label={option.label}
              onRemove={() => toggle(option.value)}
              accessibilityLabel={t('picker.removeOne', { name: option.label })}
            />
          ))}
        </View>
      ) : null}

      <Sheet
        visible={isOpen}
        title={label}
        testID={`${testIDPrefix}-sheet`}
        onClose={() => {
          setIsOpen(false);
          setQuery('');
        }}
        header={
          <SearchInput
            testID={`${testIDPrefix}-search`}
            value={query}
            onChangeText={setQuery}
            placeholder={t('picker.typeToFind')}
          />
        }
        footer={
          <PrimaryButton
            testID={`${testIDPrefix}-done`}
            title={t('picker.done')}
            onPress={() => {
              setIsOpen(false);
              setQuery('');
            }}
          />
        }
      >
        <FlatList
          data={matches}
          keyExtractor={(option) => option.value}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <OptionRow
              testID={`${testIDPrefix}-option-${item.value}`}
              title={item.label}
              description={item.description}
              icon={item.icon}
              selected={value.includes(item.value)}
              onPress={() => toggle(item.value)}
            />
          )}
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
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexGrow: 1, flexBasis: '46%' },
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
  fieldText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  list: { gap: spacing.xs, paddingBottom: spacing.sm },
  noMatch: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, paddingVertical: spacing.md },
  empty: { fontSize: 12.5, color: colors.textTertiary },
});
