import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { IoCheckmark, IoKeyOutline, IoLockClosedOutline, IoShieldCheckmarkOutline } from 'react-icons/io5';
import { changePassword } from '@/api/auth';
import { extractErrorMessage } from '@/api/client';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import PageHeader from '@/components/ui/PageHeader';
import PasswordStrength from '@/components/ui/PasswordStrength';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useAuthStore } from '@/store/authStore';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import styles from './FormPage.module.css';

const MIN_LENGTH = 8;

/**
 * Change the password while signed in — the app's Change password screen.
 *
 * The server hands back a **new token**, because the change ends every session
 * older than it. Without replacing the stored one, changing your password would
 * sign you out of the browser you did it in — while still, correctly, signing
 * out every other device.
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const replaceToken = useAuthStore((s) => s.replaceToken);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_LENGTH && newPassword === confirm && !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { token } = await changePassword({ currentPassword, newPassword });
      replaceToken(token);
      navigate(pathTo('settings'));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader
        title={t('changePassword.title')}
        subtitle={t('changePassword.settingsSubtitle')}
        backTo={pathTo('settings')}
      />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      <Enter delay={step(1)}>
        <Card>
          <p className={styles.timezoneHint}>{t('changePassword.hint')}</p>

          <FormInput
            label={t('changePassword.current')}
            icon={IoLockClosedOutline}
            isPassword
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              if (error) setError(null);
            }}
          />
          <FormInput
            label={t('changePassword.new')}
            icon={IoKeyOutline}
            isPassword
            autoComplete="new-password"
            hint={t('signup.passwordHint')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <PasswordStrength password={newPassword} />
          <FormInput
            label={t('changePassword.confirm')}
            icon={IoShieldCheckmarkOutline}
            isPassword
            autoComplete="new-password"
            error={confirm !== '' && confirm !== newPassword ? t('resetPassword.passwordMismatch') : null}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Card>
      </Enter>

      <Enter delay={step(2)} className={styles.submit}>
        <PrimaryButton
          type="submit"
          block
          title={isSubmitting ? t('resetPassword.saving') : t('changePassword.submit')}
          icon={IoCheckmark}
          loading={isSubmitting}
          disabled={!canSubmit}
        />
      </Enter>
    </form>
  );
}
