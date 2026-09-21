import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableScale from '@/components/PressableScale';
import { colors, radius, spacing, typography } from '@/theme';
import { formatDateLong, fromISODate, toISODate, todayISO } from '@/utils/date';
import { haptics } from '@/utils/haptics';

interface Props {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  /** Defaults to today, mirroring the server's future-date guard. */
  maximumDate?: Date;
  icon?: keyof typeof Ionicons.glyphMap;
  hint?: string;
  testID?: string;
}

/**
 * A real date picker.
 *
 * Replaces a plain free-text FormInput with an untranslated "YYYY-MM-DD" hint,
 * no keyboardType, no validation at all, and a decorative calendar icon that
 * did nothing — so "20-09-2026", "today" or an empty string all reached the API
 * and surfaced as a raw server error.
 *
 * `@react-native-community/datetimepicker` has no web implementation and the
 * project relies on `npm run web` for quick UI checks, so web gets a native
 * `<input type="date">` instead. The native picker is OS-localized for free,
 * which matters in a four-language app.
 */
export default function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  icon = 'calendar-outline',
  hint,
  testID,
}: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Mirrors the backend guard, so the UI never offers what the server rejects.
  const max = maximumDate ?? fromISODate(todayISO());

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.field}>
          <View style={styles.iconBox}>
            <Ionicons name={icon} size={18} color={colors.textSecondary} />
          </View>
          <TextInput
            testID={testID}
            // @ts-expect-error — `type` is a DOM prop that react-native-web
            // forwards to the underlying <input>; RN's types don't model it.
            type="date"
            style={styles.webInput}
            value={value}
            min={minimumDate ? toISODate(minimumDate) : undefined}
            max={toISODate(max)}
            onChangeText={onChange}
          />
        </View>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <PressableScale
        testID={testID}
        scaleTo={0.98}
        style={styles.field}
        onPress={() => {
          haptics.select();
          setIsOpen(true);
        }}
      >
        <View style={styles.iconBox}>
          <Ionicons name={icon} size={18} color={colors.textSecondary} />
        </View>
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatDateLong(value, t) : t('dateField.pick')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textTertiary} style={styles.chevron} />
      </PressableScale>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {isOpen ? (
        <DateTimePicker
          value={value ? fromISODate(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minimumDate}
          maximumDate={max}
          onChange={(event, selected) => {
            // Android fires 'dismissed' on cancel; iOS keeps the inline picker
            // open until the caller closes it.
            if (Platform.OS === 'android') setIsOpen(false);
            if (event.type === 'dismissed' || !selected) return;
            onChange(toISODate(selected));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingRight: spacing.md,
  },
  iconBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
  placeholder: { flex: 1, fontSize: 15, color: colors.textTertiary },
  chevron: { marginLeft: spacing.xs },
  webInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  hint: { fontSize: 11.5, color: colors.textTertiary, marginTop: spacing.xs },
});
