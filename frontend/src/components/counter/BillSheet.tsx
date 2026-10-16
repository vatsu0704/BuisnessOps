import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import DangerButton from '@/components/DangerButton';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import { colors, radius, shadow, spacing } from '@/theme';
import { formatAmountPrecise } from '@/utils/format';
import { formatTime } from '@/utils/date';
import type { DisplayBill } from '@/utils/counterQueue';

type Props = {
  bill: DisplayBill | null;
  currency: string;
  canVoid: boolean;
  /** Printing is possible on this build at all (Android with the printer module). */
  canPrint: boolean;
  busy: boolean;
  error: string | null;
  onPrint: (bill: DisplayBill) => void;
  onVoid: (bill: DisplayBill) => void;
  onClose: () => void;
};

/**
 * One bill from the day's list: what was on it, whether the server has it, and
 * the two things a cashier does to a bill already taken — print it again, or
 * void it. Never edit it: the slip in the customer's hand has to keep matching
 * the record (requirement 29), so a wrong bill is voided and rung up again.
 */
export default function BillSheet({ bill, currency, canVoid, canPrint, busy, error, onPrint, onVoid, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!bill) return null;
  const isVoid = bill.status === 'VOID';

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.head}>
              <View style={styles.token}>
                <Text style={styles.tokenText}>{bill.tokenNumber}</Text>
              </View>
              <View style={styles.headText}>
                <Text style={styles.title}>{t('counter.billTitle', { token: bill.tokenNumber })}</Text>
                <Text style={styles.meta}>{formatTime(bill.at, t)}</Text>
              </View>
              <PressableScale testID="counter-bill-close" style={styles.close} onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.text} />
              </PressableScale>
            </View>

            <View style={styles.pills}>
              {bill.paymentMethod === 'UPI' || bill.paymentMethod === 'CASH' ? (
                <Pill label={t(`paymentMethod.${bill.paymentMethod}`)} tone="brand" />
              ) : null}
              {isVoid ? <Pill label={t('counterStatus.VOID')} tone="muted" /> : null}
              {bill.rejected ? (
                <Pill label={t('counter.needsAttention')} tone="danger" icon="alert-circle-outline" />
              ) : !bill.synced ? (
                <Pill label={t('counter.notSent')} tone="warning" icon="cloud-upload-outline" />
              ) : null}
              {bill.printedNumber !== null ? (
                <Pill label={t('counter.printedAs', { token: bill.printedNumber })} tone="muted" />
              ) : null}
            </View>

            <View style={styles.lines}>
              {bill.lines.map((line, index) => (
                <View key={`${line.name}-${index}`} style={styles.lineRow}>
                  <Text style={styles.lineName}>
                    {line.quantity} × {line.name}
                  </Text>
                  <Text style={styles.lineTotal}>{formatAmountPrecise(line.lineTotal, currency)}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('counter.billTotal')}</Text>
                <Text style={[styles.totalValue, isVoid && styles.totalVoid]}>
                  {formatAmountPrecise(bill.total, currency)}
                </Text>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {canPrint && !isVoid ? (
              <PrimaryButton
                testID="counter-bill-print"
                title={t('counter.printAgain')}
                icon="print-outline"
                loading={busy}
                onPress={() => onPrint(bill)}
              />
            ) : null}
            {canVoid && !isVoid ? (
              <DangerButton
                testID="counter-bill-void"
                title={t('counter.voidBill')}
                icon="close-circle-outline"
                disabled={busy}
                onPress={() => onVoid(bill)}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(24,24,27,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.md,
  },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  token: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenText: { fontSize: 16, fontWeight: '800', color: colors.white },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12.5, color: colors.textSecondary },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  lines: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineName: { flex: 1, minWidth: 0, fontSize: 13.5, color: colors.text },
  lineTotal: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  totalLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  totalVoid: { textDecorationLine: 'line-through', color: colors.textSecondary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
