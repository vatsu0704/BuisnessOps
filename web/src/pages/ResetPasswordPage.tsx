import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { IoArrowForward, IoCheckmarkCircleOutline, IoLockClosedOutline, IoShieldCheckmarkOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { resetPassword } from '@/api/auth';
import AuthHeader from '@/components/layout/AuthHeader';
import ScreenBackground from '@/components/layout/ScreenBackground';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import InfoCard from '@/components/ui/InfoCard';
import PasswordStrength from '@/components/ui/PasswordStrength';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SectionDivider from '@/components/ui/SectionDivider';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { step } from '@/theme/motion';
import styles from './AuthPage.module.css';

const MIN_LENGTH = 8;

/**
 * Set a new password, from the link in the email.
 *
 * Deliberately **not** inside `GuestOnly`: somebody signed in on this browser who
 * clicks their own reset link would otherwise be bounced to Home without ever
 * seeing this page, which is a confusing way to be refused something that was
 * meant for them.
 *
 * Nothing is validated against the server until the form is sent — the token is
 * spent in the same request that sets the password, so there is no earlier
 * moment at which a bad link could be reported without also telling anybody who
 * guesses one whether it was real.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('resetPassword.title'));
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = password.length >= MIN_LENGTH && password === confirm && !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <ScreenBackground />
      <div className={styles.container}>
        <Enter delay={step(0)} className={styles.header}>
          <AuthHeader backTo="/login" />
        </Enter>

        <div className={styles.narrow}>
          <Enter delay={step(1)}>
            <h1 className={styles.heading}>{t('resetPassword.title')}</h1>
            <p className={styles.subtitle}>{t('resetPassword.subtitle')}</p>
          </Enter>

          <Enter delay={step(2)}>
            <SectionDivider label={t('resetPassword.divider')} />
          </Enter>

          {done ? (
            <Enter delay={step(3)} className={styles.card}>
              <p className={styles.sentTitle}>
                <IoCheckmarkCircleOutline size={18} aria-hidden="true" />
                {t('resetPassword.doneTitle')}
              </p>
              <p className={styles.sentBody}>{t('resetPassword.doneBody')}</p>
              {/* Every other device is signed out, which is most of the point. */}
              <p className={styles.sentNote}>{t('resetPassword.doneNote')}</p>
            </Enter>
          ) : token === '' ? (
            <Enter delay={step(3)} className={styles.card}>
              <ErrorBanner message={t('resetPassword.noToken')} />
            </Enter>
          ) : (
            <Enter delay={step(3)}>
              <form className={styles.card} onSubmit={handleSubmit} noValidate>
                {error ? <ErrorBanner key={error} message={error} /> : null}
                <FormInput
                  label={t('resetPassword.newPassword')}
                  icon={IoLockClosedOutline}
                  isPassword
                  autoComplete="new-password"
                  hint={t('signup.passwordHint')}
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                />
                <PasswordStrength password={password} />
                <FormInput
                  label={t('resetPassword.confirmPassword')}
                  icon={IoShieldCheckmarkOutline}
                  isPassword
                  autoComplete="new-password"
                  error={confirm !== '' && confirm !== password ? t('resetPassword.passwordMismatch') : null}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <PrimaryButton
                  type="submit"
                  block
                  title={isSubmitting ? t('resetPassword.saving') : t('resetPassword.submit')}
                  icon={IoArrowForward}
                  loading={isSubmitting}
                  disabled={!canSubmit}
                />
              </form>
            </Enter>
          )}

          <Enter delay={step(4)} className={styles.footerCard}>
            <InfoCard
              icon={IoLockClosedOutline}
              title={t('resetPassword.signIn')}
              subtitle={t('resetPassword.signInSubtitle')}
              to="/login"
            />
          </Enter>

          <Enter delay={step(5)}>
            <p className={styles.footerNote}>
              <Link to="/forgot-password" className={styles.switchLink}>
                {t('resetPassword.askAgain')}
              </Link>
            </p>
          </Enter>
        </div>
      </div>
    </div>
  );
}
