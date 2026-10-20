import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IoArrowForward, IoMailOutline, IoMailOpenOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { forgotPassword } from '@/api/auth';
import AuthHeader from '@/components/layout/AuthHeader';
import ScreenBackground from '@/components/layout/ScreenBackground';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import InfoCard from '@/components/ui/InfoCard';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SectionDivider from '@/components/ui/SectionDivider';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { step } from '@/theme/motion';
import { isValidEmail } from '@shared/utils/validation';
import styles from './AuthPage.module.css';

/**
 * Ask for a link to set a new password.
 *
 * ## Why it says the same thing either way
 *
 * The server answers identically whether or not the address has an account, so
 * this page must too. Saying "no account with that address" would turn a public
 * endpoint into a way of asking who banks here — and the API already has one
 * such leak in the invite lookup, which is not a reason to add a second.
 *
 * The cost is that a typo gets no warning, which is why the confirmation names
 * the address back.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('forgotPassword.title'));

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email) || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      // Only a refused request lands here — a rate limit, or no connection.
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
            <h1 className={styles.heading}>{t('forgotPassword.title')}</h1>
            <p className={styles.subtitle}>{t('forgotPassword.subtitle')}</p>
          </Enter>

          <Enter delay={step(2)}>
            <SectionDivider label={t('forgotPassword.divider')} />
          </Enter>

          {sent ? (
            <Enter delay={step(3)} className={styles.card}>
              <p className={styles.sentTitle}>
                <IoMailOpenOutline size={18} aria-hidden="true" />
                {t('forgotPassword.sentTitle')}
              </p>
              <p className={styles.sentBody}>{t('forgotPassword.sentBody', { email: email.trim() })}</p>
              <p className={styles.sentNote}>{t('forgotPassword.sentNote')}</p>
            </Enter>
          ) : (
            <Enter delay={step(3)}>
              <form className={styles.card} onSubmit={handleSubmit} noValidate>
                {error ? <ErrorBanner key={error} message={error} /> : null}
                <FormInput
                  label={t('login.email')}
                  icon={IoMailOutline}
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                />
                <PrimaryButton
                  type="submit"
                  block
                  title={isSubmitting ? t('forgotPassword.sending') : t('forgotPassword.submit')}
                  icon={IoArrowForward}
                  loading={isSubmitting}
                  disabled={!isValidEmail(email) || isSubmitting}
                />
              </form>
            </Enter>
          )}

          <Enter delay={step(4)} className={styles.footerCard}>
            <InfoCard
              icon={IoMailOutline}
              title={t('forgotPassword.backToLogin')}
              subtitle={t('forgotPassword.backToLoginSubtitle')}
              to="/login"
            />
          </Enter>

          <Enter delay={step(5)}>
            <p className={styles.footerNote}>
              <Link to="/signup" className={styles.switchLink}>
                {t('login.registerTitle')}
              </Link>
            </p>
          </Enter>
        </div>
      </div>
    </div>
  );
}
