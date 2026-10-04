import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BrandMark from '@/components/BrandMark';
import LanguageToggle from '@/components/LanguageToggle';
import PressableScale from '@/components/PressableScale';
import Wordmark from '@/components/Wordmark';
import { colors, radius, spacing } from '@/theme';

type Props = {
  onBack?: () => void;
  caption?: string;
};

export default function AuthHeader({ onBack, caption }: Props) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <PressableScale style={styles.backButton} onPress={onBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </PressableScale>
      ) : null}
      <BrandMark width={40} />
      {/* Takes whatever the row has left, so on a narrow phone the name stacks
          and the caption wraps instead of pushing the language toggle off screen. */}
      <View style={styles.name}>
        <Wordmark size={20} />
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <LanguageToggle />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { flex: 1 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: -1 },
});
