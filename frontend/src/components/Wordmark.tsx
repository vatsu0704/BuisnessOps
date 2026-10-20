import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { APP_NAME, APP_NAME_PARTS } from '@/constants/brand';
import { colors } from '@/theme';

type Props = {
  size: number;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
};

/**
 * The name set the way the logo sets it: "Kitna" in navy, "pay" in coral.
 *
 * The drawn mark keeps the logo's lowercase p; prose spells it KitnaPay, so
 * the accessible label is `APP_NAME` and not the parts joined.
 *
 * The two words are separate Text nodes in a wrapping row, so a header too
 * narrow for the whole name puts "pay" under "Kitna" — a stacked lockup —
 * instead of clipping it, shrinking it or breaking it mid-word. The row shrinks
 * itself; a parent only has to let it (a column that stretches it, or
 * `flexShrink: 1` on whatever wraps it in a row). At its natural width it is
 * one line. It reads as one word to a screen reader.
 */
export default function Wordmark({ size, align = 'left', style }: Props) {
  const [first, second] = APP_NAME_PARTS;
  const type = { fontSize: size, lineHeight: Math.round(size * 1.15), letterSpacing: -size * 0.018 };

  return (
    <View
      style={[styles.row, align === 'center' && styles.centred, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={APP_NAME}
    >
      <Text style={[styles.word, type, styles.navy]}>{first}</Text>
      <Text style={[styles.word, type, styles.coral]}>{second}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1 },
  centred: { justifyContent: 'center' },
  word: { fontWeight: '800' },
  navy: { color: colors.primary },
  coral: { color: colors.accent },
});
