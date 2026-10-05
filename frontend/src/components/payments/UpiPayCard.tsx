import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import QrCode from '@/components/payments/QrCode';
import { colors, radius, spacing } from '@/theme';
import { formatAmountPrecise } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { buildUpiUri, isUpiCurrency, openUpiApp, type UpiPayee } from '@/utils/upi';

type Props = {
  payee: UpiPayee;
  /** The exact amount, paise included — the QR asks for precisely this. */
  amount: number;
  currency: string;
  /** What the receiver reads in their UPI app: the branch code and order numbers. */
  note: string;
  /**
   * How much horizontal room the screen has already used around this card —
   * its own padding plus every container's — so the QR is sized from what is
   * actually left. Defaults to a card inside a padded screen.
   */
  horizontalInset?: number;
  /**
   * "Payment done". Omitted where the card is shown for somebody else to scan,
   * which is the agent's case: the person paying is the cashier, on their own
   * phone, and the agent records it with their own answer.
   */
  onDone?: () => void;
  doneLabel?: string;
  doneBusy?: boolean;
  /**
   * For the cart, where "Payment done" is a tick per supplier before one Place
   * button rather than a request: true shows the tick and a way to take it back.
   */
  done?: boolean;
  onUndo?: () => void;
  testID?: string;
};

/** Bigger than this and the code is merely large; a phone camera reads 240dp from arm's length. */
const QR_MAX = 240;
/** Smaller than this and a cheap camera starts to struggle with a 41×41 code. */
const QR_MIN = 168;
/** The card's own padding, which the QR sits inside. */
const CARD_PADDING = spacing.lg;
/** The card's 1dp border, each side — small, and enough to overflow by on a 320dp phone. */
const CARD_BORDER = 1;
/** The white frame around the code: its padding plus its 1dp border, per side. */
const FRAME = spacing.sm + 1;

/**
 * Pay one payee by UPI — requirement 26.
 *
 * Everything stacks, top to bottom: who, how much, the QR, the two ways to pay,
 * and "Payment done". Nothing shares a row with anything that grows, because the
 * payee's name and every Indic translation of these labels run longer than the
 * English, and a row of two growing things is the one that breaks in Gujarati.
 *
 * ## Two ways to pay, because one phone cannot scan its own screen
 *
 * The QR is for a SECOND phone — the cashier scanning the code on the delivery
 * agent's phone, or the accountant scanning a code on a shared tablet. When the
 * payer is holding the phone the code is on, "Pay with UPI app" opens their own
 * GPay, PhonePe or bank app on the same payment instead, amount filled in.
 *
 * ## What the size is derived from
 *
 * The window, not a fixed number: the QR is what is left of the width once the
 * screen's gutters, the card's border and padding and the code's own white
 * frame are taken off — capped at 240 and floored at 168. On a 320dp phone with
 * the default inset that is 320 − 48 − 2 − 32 − 18 = 220, which fills the card's
 * inside exactly; on a 393dp phone it reaches the cap with 55dp to spare. Both
 * are comfortably above what a camera needs, and the framed code never comes
 * out wider than the card it sits in.
 */
export default function UpiPayCard({
  payee,
  amount,
  currency,
  note,
  horizontalInset = spacing.xl * 2,
  onDone,
  doneLabel,
  doneBusy,
  done,
  onUndo,
  testID,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [noApp, setNoApp] = useState(false);

  const payable = !!payee.upiId && isUpiCurrency(currency) && amount > 0;
  const uri = useMemo(
    () => (payable && payee.upiId ? buildUpiUri({ upiId: payee.upiId, name: payee.name, amount, note }) : null),
    [payable, payee.upiId, payee.name, amount, note]
  );
  const qrSize = Math.max(
    QR_MIN,
    Math.min(QR_MAX, width - horizontalInset - CARD_BORDER * 2 - CARD_PADDING * 2 - FRAME * 2)
  );
  const amountLabel = formatAmountPrecise(amount, currency);

  async function handleOpenApp() {
    if (!uri) return;
    haptics.tap();
    setNoApp(false);
    const opened = await openUpiApp(uri);
    if (!opened) {
      haptics.error();
      setNoApp(true);
    }
  }

  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconTile}>
          <Ionicons name={payee.kind === 'VENDOR' ? 'storefront-outline' : 'cube-outline'} size={18} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('upiPay.payTo', { name: payee.name })}</Text>
          {payee.upiId ? (
            <Text style={styles.upiId} selectable>
              {payee.upiId}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.amount}>{amountLabel}</Text>

      {uri ? (
        <>
          <View style={styles.qrFrame}>
            <QrCode
              value={uri}
              size={qrSize}
              testID={testID ? `${testID}-qr` : undefined}
              accessibilityLabel={t('upiPay.qrLabel', { amount: amountLabel, name: payee.name })}
            />
          </View>
          <Text style={styles.hint}>{t('upiPay.scanHint')}</Text>

          <PressableScale
            testID={testID ? `${testID}-open-app` : undefined}
            style={styles.secondary}
            scaleTo={0.98}
            onPress={() => void handleOpenApp()}
          >
            <Ionicons name="open-outline" size={16} color={colors.primary} />
            <Text style={styles.secondaryText}>{t('upiPay.openApp')}</Text>
          </PressableScale>
          {noApp ? <Text style={styles.warn}>{t('upiPay.noApp')}</Text> : null}
        </>
      ) : (
        <View style={styles.notSet}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.notSetText}>
            {isUpiCurrency(currency) ? t('upiPay.notSet', { name: payee.name }) : t('upiPay.notRupees')}
          </Text>
        </View>
      )}

      {onDone && uri ? (
        done ? (
          <View style={styles.doneRow}>
            <View style={styles.doneMark}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.doneText}>{t('upiPay.doneMarked')}</Text>
            </View>
            {onUndo ? (
              <PressableScale testID={testID ? `${testID}-undo` : undefined} scaleTo={0.97} onPress={onUndo}>
                <Text style={styles.undo}>{t('upiPay.undo')}</Text>
              </PressableScale>
            ) : null}
          </View>
        ) : (
          <PrimaryButton
            testID={testID ? `${testID}-done` : undefined}
            title={doneLabel ?? t('upiPay.done')}
            icon="checkmark"
            loading={doneBusy}
            onPress={onDone}
            style={styles.done}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: CARD_BORDER,
    borderColor: colors.border,
    padding: CARD_PADDING,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // flex: 1 with minWidth 0 is what lets a long payee name wrap inside the row
  // instead of pushing the row wider than the card.
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 20 },
  upiId: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  amount: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  qrFrame: {
    alignSelf: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 18, textAlign: 'center' },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondaryText: { fontSize: 14, fontWeight: '700', color: colors.primary, flexShrink: 1, textAlign: 'center' },
  warn: { fontSize: 12.5, color: colors.warning, lineHeight: 18 },
  notSet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FDF3E3',
  },
  notSetText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  done: { marginTop: spacing.xs },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  doneMark: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, flexShrink: 1 },
  doneText: { fontSize: 14, fontWeight: '700', color: colors.success, flexShrink: 1 },
  undo: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary, paddingVertical: spacing.xs },
});
