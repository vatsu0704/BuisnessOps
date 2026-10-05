import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import QrCode from '@/components/payments/QrCode';
import { extractErrorMessage } from '@/api/client';
import { colors, radius, spacing } from '@/theme';
import { confirm } from '@/utils/confirm';
import { formatDate, formatTime, toISODate } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import { buildUpiUri, isValidUpiId } from '@/utils/upi';

type Props = {
  /** Whose UPI ID this is — "the warehouse", a vendor's name. */
  payeeLabel: string;
  /** What the payer's UPI app should show when no name is typed. */
  fallbackName: string;
  upiId: string | null;
  upiName: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  onSave: (upiId: string | null, upiName: string | null) => Promise<void>;
  testID?: string;
};

/** Small, because it is a check, not a payment — but still large enough to scan. */
const PREVIEW_SIZE = 168;

/**
 * Where one payee's money goes — requirement 26.
 *
 * A UPI ID and the name a payer's app shows, a preview QR to scan as a check,
 * and who last changed it. Used for the warehouse and for every vendor, so the
 * rules about a valid UPI ID and the audit line are the same for all of them.
 *
 * The preview carries NO amount, on purpose: scanning it opens the UPI app on
 * the right name with an empty amount, which is what checking needs, and
 * nobody pays a set-up screen by accident.
 *
 * Changing this is the one edit in the app that can redirect money, so who did
 * it and when is shown right here — the person who set it can see if somebody
 * else has since changed it.
 */
export default function UpiAccountEditor({
  payeeLabel,
  fallbackName,
  upiId,
  upiName,
  updatedAt,
  updatedByName,
  onSave,
  testID,
}: Props) {
  const { t } = useTranslation();
  const [draftId, setDraftId] = useState(upiId ?? '');
  const [draftName, setDraftName] = useState(upiName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A save elsewhere — or a refresh — replaces what is shown, unless the person
  // is part-way through typing a change of their own.
  useEffect(() => {
    setDraftId(upiId ?? '');
    setDraftName(upiName ?? '');
  }, [upiId, upiName]);

  const trimmedId = draftId.trim();
  const looksValid = trimmedId === '' || isValidUpiId(trimmedId);
  const changed = trimmedId.toLowerCase() !== (upiId ?? '') || draftName.trim() !== (upiName ?? '');
  const previewId = isValidUpiId(trimmedId) ? trimmedId : upiId;

  async function save(nextId: string | null, nextName: string | null) {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(nextId, nextName);
      haptics.success();
      setSaved(true);
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  /** Taking it off turns "pay now" off for this payee, so it asks first. */
  async function askThenRemove() {
    const ok = await confirm({
      title: t('paymentAccounts.removeTitle', { payee: payeeLabel }),
      body: t('paymentAccounts.removeBody'),
      confirmLabel: t('paymentAccounts.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) await save(null, null);
  }

  return (
    <View testID={testID} style={styles.card}>
      <FormInput
        testID={testID ? `${testID}-upi-id` : undefined}
        label={t('paymentAccounts.upiId')}
        icon="at-outline"
        placeholder="name@okaxis"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={draftId}
        onChangeText={(text) => {
          setDraftId(text);
          setSaved(false);
        }}
      />
      {!looksValid ? <Text style={styles.warn}>{t('paymentAccounts.upiIdInvalid')}</Text> : null}

      <FormInput
        testID={testID ? `${testID}-upi-name` : undefined}
        label={t('paymentAccounts.upiName')}
        hint={t('addStaff.optional')}
        icon="person-outline"
        placeholder={fallbackName}
        value={draftName}
        onChangeText={(text) => {
          setDraftName(text);
          setSaved(false);
        }}
      />

      {previewId ? (
        <View style={styles.preview}>
          <View style={styles.qrFrame}>
            <QrCode
              value={buildUpiUri({ upiId: previewId, name: draftName.trim() || fallbackName })}
              size={PREVIEW_SIZE}
              accessibilityLabel={t('paymentAccounts.previewLabel', { payee: payeeLabel })}
            />
          </View>
          <Text style={styles.previewHint}>{t('paymentAccounts.previewHint')}</Text>
        </View>
      ) : null}

      {updatedAt ? (
        <View style={styles.audit}>
          <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.auditText}>
            {t('paymentAccounts.changedBy', {
              name: updatedByName ?? t('paymentAccounts.someone'),
              date: formatDate(toISODate(new Date(updatedAt)), t),
              time: formatTime(updatedAt, t),
            })}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved && !changed ? (
        <View style={styles.savedRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.savedText}>{t('paymentAccounts.saved')}</Text>
        </View>
      ) : null}

      <PrimaryButton
        testID={testID ? `${testID}-save` : undefined}
        title={t('paymentAccounts.save')}
        icon="checkmark"
        loading={isSaving}
        disabled={!changed || !looksValid || trimmedId === ''}
        onPress={() => void save(trimmedId, draftName.trim() || null)}
      />
      {upiId ? (
        <PressableScale
          testID={testID ? `${testID}-remove` : undefined}
          style={styles.remove}
          scaleTo={0.98}
          onPress={() => void askThenRemove()}
        >
          <Text style={styles.removeText}>{t('paymentAccounts.remove')}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  warn: { fontSize: 12.5, color: colors.warning, lineHeight: 17, marginTop: -spacing.xs },
  preview: { alignItems: 'center', gap: spacing.sm },
  qrFrame: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewHint: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, textAlign: 'center' },
  audit: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  auditText: { flex: 1, fontSize: 12.5, color: colors.textTertiary, lineHeight: 17 },
  error: { fontSize: 13, color: colors.error, lineHeight: 18 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  savedText: { fontSize: 13, fontWeight: '600', color: colors.success },
  remove: { alignSelf: 'center', paddingVertical: spacing.xs },
  removeText: { fontSize: 13.5, fontWeight: '600', color: colors.error },
});
