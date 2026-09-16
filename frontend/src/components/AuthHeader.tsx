import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BrandMark from '@/components/BrandMark';
import PressableScale from '@/components/PressableScale';
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
      <BrandMark size={40} />
      <View>
        <Text style={styles.wordmark}>BizIQ</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  wordmark: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  caption: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: -1 },
});
