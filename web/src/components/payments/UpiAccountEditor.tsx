import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IoAt, IoCheckmark, IoCheckmarkCircle, IoPersonOutline, IoTimeOutline } from 'react-icons/io5';
import { buildUpiUri, isValidUpiId } from '@shared/utils/upiUri';
import { extractErrorMessage } from '@/api/client';
import FormInput from '@/components/ui/FormInput';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { confirm } from '@/utils/confirm';
import { formatDate, formatTime, toISODate } from '@/utils/date';
import QrCode from './QrCode';
import styles from './UpiAccountEditor.module.css';

/**
 * Where one payee's money goes — requirement 26, the app's `UpiAccountEditor`.
 *
 * A UPI ID and the name a payer's app shows, a preview QR to scan as a check,
 * and who last changed it. One component for the counter, every shop, the
 * warehouse and every vendor, so the rules about a valid UPI ID and the audit
 * line are the same for all of them.
 *
 * The preview carries NO amount, on purpose: scanning it opens the UPI app on the
 * right name with an empty amount, which is what checking needs, and nobody pays
 * a set-up page by accident. Changing this is the one edit that can redirect
 * money, so who did it and when is shown right here.
 */
export default function UpiAccountEditor({
  payeeLabel,
  fallbackName,
  upiId,
  upiName,
  updatedAt,
  updatedByName,
  onSave,
  removeBody,
}: {
  /** Whose UPI ID this is — "the warehouse", a vendor's name. */
  payeeLabel: string;
  /** What the payer's UPI app shows when no name is typed. */
  fallbackName: string;
  upiId: string | null;
  upiName: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  onSave: (upiId: string | null, upiName: string | null) => Promise<void>;
  /** What taking it off means for this payee, said in the question. */
  removeBody?: string;
}) {
  const { t } = useTranslation();
  const [draftId, setDraftId] = useState(upiId ?? '');
  const [draftName, setDraftName] = useState(upiName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A save elsewhere, or a refresh, replaces what is shown.
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
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!changed || !looksValid || trimmedId === '' || isSaving) return;
    void save(trimmedId, draftName.trim() || null);
  }

  /** Taking it off turns "pay now" off for this payee, so it asks first. */
  async function askThenRemove() {
    const ok = await confirm({
      title: t('paymentAccounts.removeTitle', { payee: payeeLabel }),
      body: removeBody ?? t('paymentAccounts.removeBody'),
      confirmLabel: t('paymentAccounts.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) await save(null, null);
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <div className={styles.fields}>
        <FormInput
          label={t('paymentAccounts.upiId')}
          icon={IoAt}
          placeholder="name@okaxis"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          value={draftId}
          onChange={(event) => {
            setDraftId(event.target.value);
            setSaved(false);
          }}
          error={looksValid ? null : t('paymentAccounts.upiIdInvalid')}
        />
        <FormInput
          label={t('paymentAccounts.upiName')}
          hint={t('addStaff.optional')}
          icon={IoPersonOutline}
          placeholder={fallbackName}
          value={draftName}
          onChange={(event) => {
            setDraftName(event.target.value);
            setSaved(false);
          }}
        />
      </div>

      {previewId ? (
        <div className={styles.preview}>
          <div className={styles.qrFrame}>
            <QrCode
              value={buildUpiUri({ upiId: previewId, name: draftName.trim() || fallbackName })}
              label={t('paymentAccounts.previewLabel', { payee: payeeLabel })}
            />
          </div>
          <p className={styles.previewHint}>{t('paymentAccounts.previewHint')}</p>
        </div>
      ) : null}

      {updatedAt ? (
        <p className={styles.audit}>
          <IoTimeOutline size={14} aria-hidden="true" />
          <span>
            {t('paymentAccounts.changedBy', {
              name: updatedByName ?? t('paymentAccounts.someone'),
              date: formatDate(toISODate(new Date(updatedAt)), t),
              time: formatTime(updatedAt, t),
            })}
          </span>
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {saved && !changed ? (
        <p className={styles.saved} role="status">
          <IoCheckmarkCircle size={16} aria-hidden="true" />
          <span>{t('paymentAccounts.saved')}</span>
        </p>
      ) : null}

      <div className={styles.actions}>
        <PrimaryButton
          type="submit"
          block
          title={t('paymentAccounts.save')}
          icon={IoCheckmark}
          loading={isSaving}
          disabled={!changed || !looksValid || trimmedId === ''}
        />
        {upiId ? (
          <button type="button" className={styles.remove} onClick={() => void askThenRemove()} disabled={isSaving}>
            {t('paymentAccounts.remove')}
          </button>
        ) : null}
      </div>
    </form>
  );
}
