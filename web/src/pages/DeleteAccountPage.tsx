import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  IoBusinessOutline,
  IoDocumentTextOutline,
  IoDownloadOutline,
  IoExitOutline,
  IoLockClosedOutline,
  IoPersonRemoveOutline,
  IoTrashOutline,
} from 'react-icons/io5';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import PageHeader from '@/components/ui/PageHeader';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { legalPageUrl } from '@/utils/legalLinks';
import formStyles from './FormPage.module.css';
import styles from './DeleteAccountPage.module.css';

function Bullet({ icon: Icon, text }: { icon: IconType; text: string }) {
  return (
    <p className={styles.bullet}>
      <Icon size={17} className={styles.bulletIcon} aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/**
 * Deleting your own account — the app's Delete account screen. The server decides
 * what goes; this page says it plainly before anyone presses the button, asks for
 * the password, and asks once more.
 *
 * Which businesses go with the account is read from the memberships already in
 * the session: it is **ownership**, not a permission — every business has exactly
 * one OWNER membership, the one that created it. Whether an owned business still
 * has a team is the server's call, made in the transaction that would delete it.
 */
export default function DeleteAccountPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = (user?.memberships ?? []).filter((m) => m.status === 'ACTIVE');
  const owned = active.filter((m) => m.role === 'OWNER');
  const workedIn = active.filter((m) => m.role !== 'OWNER');
  const canSubmit = password.length > 0 && !isSubmitting;

  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const sure = await confirm({
      title: t('deleteAccount.confirmTitle'),
      body: owned.length > 0 ? t('deleteAccount.confirmBodyOwner') : t('deleteAccount.confirmBody'),
      confirmLabel: t('deleteAccount.confirmAction'),
      cancelLabel: t('common.cancel'),
    });
    if (!sure) return;

    try {
      // On success the session ends and the router shows sign-in.
      await deleteAccount(password);
    } catch {
      setError(useAuthStore.getState().error);
    }
  }

  return (
    <form className={formStyles.page} onSubmit={handleDelete} noValidate>
      <PageHeader title={t('deleteAccount.title')} subtitle={t('deleteAccount.subtitle')} backTo={pathTo('settings')} />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      <Enter delay={step(1)}>
        <Card title={t('deleteAccount.goesTitle')}>
          <Bullet icon={IoPersonRemoveOutline} text={t('deleteAccount.goesAccount')} />
          {owned.length > 0 ? (
            <>
              <Bullet icon={IoBusinessOutline} text={t('deleteAccount.goesBusinesses')} />
              <ul className={styles.names}>
                {owned.map((m) => (
                  <li key={m.id}>{m.business.name}</li>
                ))}
              </ul>
              <p className={styles.tip}>
                <IoDownloadOutline size={16} aria-hidden="true" />
                <span>{t('deleteAccount.exportFirst')}</span>
              </p>
              <p className={styles.note}>{t('deleteAccount.teamRule')}</p>
            </>
          ) : null}
        </Card>
      </Enter>

      {workedIn.length > 0 ? (
        <Enter delay={step(2)}>
          <Card title={t('deleteAccount.staysTitle')}>
            <Bullet icon={IoExitOutline} text={t('deleteAccount.losesAccess')} />
            <ul className={styles.names}>
              {workedIn.map((m) => (
                <li key={m.id}>{m.business.name}</li>
              ))}
            </ul>
            <Bullet icon={IoDocumentTextOutline} text={t('deleteAccount.employerKeeps')} />
          </Card>
        </Enter>
      ) : null}

      <Enter delay={step(3)}>
        <Card>
          <FormInput
            label={t('deleteAccount.passwordLabel')}
            hint={t('deleteAccount.passwordHint')}
            icon={IoLockClosedOutline}
            isPassword
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
          />
          <Button
            type="submit"
            variant="dangerSolid"
            icon={IoTrashOutline}
            title={isSubmitting ? t('deleteAccount.submitting') : t('deleteAccount.submit')}
            loading={isSubmitting}
            disabled={!canSubmit}
            block
          />
        </Card>
      </Enter>

      <Enter delay={step(4)} className={styles.readMoreWrap}>
        <a href={legalPageUrl('delete-account')} target="_blank" rel="noopener noreferrer" className={styles.readMore}>
          {t('deleteAccount.readMore')}
        </a>
      </Enter>
    </form>
  );
}
