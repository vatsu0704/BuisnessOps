import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useToday } from '@/hooks/useToday';
import { useCounterStore } from '@/store/counterStore';
import { pendingSales } from '@/utils/counterQueue';
import { formatAmountPrecise } from '@/utils/format';
import { formatTime } from '@/utils/date';
import { colors, radius, spacing } from '@/theme';

/**
 * The day's latest bills (requirement 33), like the list a till app opens on —
 * and, when this phone has bills it has not sent yet, how many, so a number on
 * Home never quietly disagrees with the counter.
 */
export default function RecentBillsSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const businessId = useBusinessId();
  const { today } = useToday();
  const unsent = useCounterStore((s) => (s.loadedFor === businessId ? pendingSales(s.queue).length : 0));

  const bills = today?.recentBills ?? [];
  const severalBranches = new Set(bills.map((bill) => bill.branchId)).size > 1;
  if (bills.length === 0 && unsent === 0) return null;

  return (
    <View testID="home-recent-bills" style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('home.recentBills')}</Text>
        <PressableScale testID="home-recent-bills-all" scaleTo={0.96} onPress={() => navigation.navigate('Counter')}>
          <Text style={styles.link}>{t('home.seeAll')}</Text>
        </PressableScale>
      </View>

      {unsent > 0 ? (
        <View style={styles.unsent}>
          <Ionicons name="cloud-upload-outline" size={15} color={colors.warning} />
          <Text style={styles.unsentText}>{t('counter.sync.pending', { count: unsent })}</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {bills.map((bill, index) => (
          <View key={bill.id} style={[styles.row, index > 0 && styles.rowDivider]}>
            <View style={styles.text}>
              <Text style={[styles.bill, bill.status === 'VOID' && styles.void]}>
                {t('counter.billTitle', { token: bill.tokenNumber })}
              </Text>
              <Text style={styles.meta}>
                {t('counter.itemCount', { count: bill.itemCount })} · {formatTime(bill.at, t)}
                {severalBranches ? ` · ${bill.branchName}` : ''}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.amount, bill.status === 'VOID' && styles.void]}>
                {formatAmountPrecise(Number(bill.totalAmount), bill.currency)}
              </Text>
              {bill.status === 'VOID' ? (
                <Pill label={t('counterStatus.VOID')} tone="muted" />
              ) : bill.paymentMethod === 'UPI' || bill.paymentMethod === 'CASH' ? (
                <Pill label={t(`paymentMethod.${bill.paymentMethod}`)} tone="brand" />
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flexShrink: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary },
  unsent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  unsentText: { flex: 1, fontSize: 12.5, color: colors.warning },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  text: { flex: 1, minWidth: 0, gap: 2 },
  bill: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12.5, color: colors.textSecondary },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  void: { textDecorationLine: 'line-through', color: colors.textSecondary },
});
