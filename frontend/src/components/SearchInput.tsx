import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A box to type into when a list is too long to scan — the one the raw-material
 * catalog has always had, now shared, because every list in this app grows with
 * the business and the catalog was simply the first to outgrow a screen.
 *
 * `returnKeyType="search"` so the keyboard's action key says what it does, and
 * no `onSubmitEditing`: these lists filter as you type, so submitting is only
 * ever a way to put the keyboard away.
 */
export default function SearchInput({ value, onChangeText, placeholder, autoFocus, style, testID }: Props) {
  return (
    <View style={[styles.box, style]}>
      <Ionicons name="search" size={16} color={colors.textTertiary} />
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: spacing.md - 2, fontSize: 14, color: colors.text },
});
