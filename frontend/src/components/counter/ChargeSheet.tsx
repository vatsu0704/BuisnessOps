import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import SegmentedOption from '@/components/SegmentedOption';
import UpiPayCard from '@/components/payments/UpiPayCard';
import { colors, radius, shadow, spacing } from '@/theme';
import { formatAmountPrecise } from '@/utils/format';
import { money } from '@/utils/counterQueue';
import { isUpiCurrency } from '@/utils/upiUri';
import type { CounterPayee, CounterPaymentMethod } from '@/types/counter';

/** What happened to the token's printout, for the done step. */
export type PrintState = 'printing' | 'printed' | 'failed' | 'off' | 'noPrinter' | 'unsupported';

export type ChargeDone = {
  tokenNumber: number;
  print: PrintState;
  printError: string | null;
};

type Props = {
  visible: boolean;
  amount: number;
  currency: string;
  payee: CounterPayee | null;
  /** In the UPI note, so the shop can match a payment in its bank app to a bill. */
  noteLabel: string;
  busy: boolean;
  done: ChargeDone | null;
  onPaid: (method: CounterPaymentMethod) => void;
  onPrint: () => void;
  onSetUpPrinter: () => void;
  onClose: () => void;
};

/** Notes a customer might hand over; the ones above the bill are offered as "gave". */
const NOTES = [10, 20, 50, 100, 200, 500, 2000];

/**
 * Taking the money, then the token — requirement 29.
 *
 * Two steps on one sheet. First the payment: UPI shows the QR for the exact
 * amount, which the customer scans with their own phone; cash shows the amount
 * and works out the change. Either ends in "Payment done", which saves the bill
 * on the phone and issues the token. Then the token, large, with what happened
 * to its printout — and the way to print it again.
 *
 * Nothing on it asks for confirmation: a bill taken by mistake is voided from
 * the day's list, and a question in front of every sale is a question nobody
 * reads by lunchtime.
 */
export default function ChargeSheet({
  visible,
  amount,
  currency,
  payee,
  noteLabel,
  busy,
  done,
  onPaid,
  onPrint,
  onSetUpPrinter,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const upiPossible = !!payee && isUpiCurrency(currency);
  const [method, setMethod] = useState<CounterPaymentMethod>(upiPossible ? 'UPI' : 'CASH');
  const [given, setGiven] = useState<number | null>(null);

  // A new bill starts on UPI again (when there is a UPI ID), with nothing given.
  useEffect(() => {
    if (visible && !done) {
      setMethod(upiPossible ? 'UPI' : 'CASH');
      setGiven(null);
    }
  }, [visible, done, upiPossible]);

  const offers = useMemo(() => NOTES.filter((note) => note > amount).slice(0, 4), [amount]);
  const change = given !== null ? money(given - amount) : null;
  const amountLabel = formatAmountPrecise(amount, currency);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          {done ? (
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.doneHead}>
                <Ionicons name="checkmark-circle" size={44} color={colors.success} />
                <Text style={styles.doneLabel}>{t('counter.tokenLabel')}</Text>
                <Text testID="counter-done-token" style={styles.doneToken}>
                  {done.tokenNumber}
                </Text>
                <Text style={styles.doneBody}>{t('counter.doneBody')}</Text>
              </View>

              <PrintStatus done={done} onPrint={onPrint} onSetUpPrinter={onSetUpPrinter} />

              <PrimaryButton testID="counter-next-bill" title={t('counter.nextBill')} icon="add" onPress={onClose} />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.head}>
                <View style={styles.headText}>
                  <Text style={styles.title}>{t('counter.chargeTitle')}</Text>
                  <Text style={styles.amount}>{amountLabel}</Text>
                </View>
                <PressableScale
                  testID="counter-charge-close"
                  style={styles.close}
                  onPress={() => {
                    if (!busy) onClose();
                  }}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </PressableScale>
              </View>

              {upiPossible ? (
                <View style={styles.segmented}>
                  <SegmentedOption
                    testID="counter-pay-upi"
                    title={t('paymentMethod.UPI')}
                    icon="qr-code-outline"
                    selected={method === 'UPI'}
                    onPress={() => setMethod('UPI')}
                  />
                  <SegmentedOption
                    testID="counter-pay-cash"
                    title={t('paymentMethod.CASH')}
                    icon="cash-outline"
                    selected={method === 'CASH'}
                    onPress={() => setMethod('CASH')}
                  />
                </View>
              ) : (
                <View style={styles.note}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.noteText}>
                    {isUpiCurrency(currency) ? t('counter.upiNotSet') : t('upiPay.notRupees')}
                  </Text>
                </View>
              )}

              {method === 'UPI' && payee ? (
                <UpiPayCard
                  testID="counter-upi"
                  payee={{ kind: 'COUNTER', name: payee.name, upiId: payee.upiId }}
                  amount={amount}
                  currency={currency}
                  note={noteLabel}
                  onDone={() => onPaid('UPI')}
                  doneLabel={t('counter.paymentDone')}
                  doneBusy={busy}
                />
              ) : (
                <View style={styles.cashCard}>
                  <Text style={styles.cashLabel}>{t('counter.cashGiven')}</Text>
                  <View style={styles.chips}>
                    <Chip
                      testID="counter-cash-exact"
                      label={t('counter.cashExact')}
                      selected={given === amount}
                      onPress={() => setGiven(amount)}
                    />
                    {offers.map((note) => (
                      <Chip
                        key={note}
                        testID={`counter-cash-${note}`}
                        label={formatAmountPrecise(note, currency)}
                        selected={given === note}
                        onPress={() => setGiven(note)}
                      />
                    ))}
                  </View>
                  {change !== null && change > 0 ? (
                    <View style={styles.changeBox}>
                      <Text style={styles.changeLabel}>{t('counter.cashChange')}</Text>
                      <Text testID="counter-cash-change" style={styles.changeValue}>
                        {formatAmountPrecise(change, currency)}
                      </Text>
                    </View>
                  ) : null}
                  <PrimaryButton
                    testID="counter-cash-done"
                    title={t('counter.paymentDone')}
                    icon="checkmark"
                    loading={busy}
                    onPress={() => onPaid('CASH')}
                  />
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PrintStatus({
  done,
  onPrint,
  onSetUpPrinter,
}: {
  done: ChargeDone;
  onPrint: () => void;
  onSetUpPrinter: () => void;
}) {
  const { t } = useTranslation();
  if (done.print === 'unsupported') return null;

  if (done.print === 'printing') {
    return (
      <View style={styles.printRow}>
        <Ionicons name="print-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.printText}>{t('counter.printing')}</Text>
      </View>
    );
  }
  if (done.print === 'printed') {
    return (
      <View style={styles.printBlock}>
        <View style={styles.printRow}>
          <Ionicons name="checkmark-done-outline" size={16} color={colors.success} />
          <Text style={[styles.printText, { color: colors.success }]}>{t('counter.printed')}</Text>
        </View>
        <PressableScale testID="counter-print-again" style={styles.link} onPress={onPrint}>
          <Text style={styles.linkText}>{t('counter.printAgain')}</Text>
        </PressableScale>
      </View>
    );
  }
  if (done.print === 'noPrinter') {
    return (
      <View style={styles.printBlock}>
        <Text style={styles.printText}>{t('counter.noPrinter')}</Text>
        <PressableScale testID="counter-set-up-printer" style={styles.link} onPress={onSetUpPrinter}>
          <Text style={styles.linkText}>{t('counter.setUpPrinter')}</Text>
        </PressableScale>
      </View>
    );
  }
  return (
    <View style={styles.printBlock}>
      {done.print === 'failed' && done.printError ? (
        <View style={styles.printRow}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={[styles.printText, { color: colors.error }]}>{done.printError}</Text>
        </View>
      ) : null}
      <PressableScale testID="counter-print" style={styles.link} onPress={onPrint}>
        <Ionicons name="print-outline" size={16} color={colors.primary} />
        <Text style={styles.linkText}>
          {done.print === 'failed' ? t('counter.printAgain') : t('counter.printToken')}
        </Text>
      </PressableScale>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <PressableScale
      testID={testID}
      scaleTo={0.96}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(24,24,27,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '94%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.md,
  },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  amount: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
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
  segmented: { flexDirection: 'row', gap: spacing.sm },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  noteText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  cashCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cashLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  chipTextSelected: { color: colors.primaryDark },
  changeBox: {
    backgroundColor: '#E8F6ED',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  changeLabel: { fontSize: 12.5, fontWeight: '700', color: colors.success },
  changeValue: { fontSize: 24, fontWeight: '800', color: colors.success },
  doneHead: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  doneLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  doneToken: { fontSize: 64, fontWeight: '900', color: colors.primary, letterSpacing: -1 },
  doneBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  printBlock: { alignItems: 'center', gap: spacing.xs },
  printRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' },
  printText: { flexShrink: 1, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
