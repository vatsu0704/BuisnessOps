import { useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { IoArrowForward, IoBarChart, IoLockClosedOutline, IoMailOutline, IoStorefrontOutline, IoTrendingUp } from 'react-icons/io5';
import AuthHeader from '@/components/layout/AuthHeader';
import ScreenBackground from '@/components/layout/ScreenBackground';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import HeroCard from '@/components/ui/HeroCard';
import InfoCard from '@/components/ui/InfoCard';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SectionDivider from '@/components/ui/SectionDivider';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useShakeOnError } from '@/hooks/useShakeOnError';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import styles from './AuthPage.module.css';

/**
 * Sign in. The app's Login screen, laid out for a wide window: what the product
 * is on the left, the form on the right. Narrower than a laptop it is the app's
 * single column, in the app's order.
 *
 * Where to go afterwards is the router's business — `GuestOnly` sends a signed-in
 * visitor to the page they were sent here from.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useAuthStore((s) => s.login);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const cardRef = useShakeOnError<HTMLFormElement>(error);
  useDocumentTitle(t('login.submit'), { withAppName: false });

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch {
      // The store holds the message and the banner shows it.
    }
  }

  return (
    <div className={styles.page}>
      <ScreenBackground />
      <div className={styles.container}>
        <Enter delay={step(0)} className={styles.header}>
          <AuthHeader />
        </Enter>

        <div className={styles.loginGrid}>
          <div className={styles.intro}>
            <Enter delay={step(1)} className={styles.introText}>
              <Pill label={t('login.pill')} icon={IoTrendingUp} />
              {/* One sentence with the name tagged inside it: Hindi, Gujarati and
                  Marathi put the name first. The key is not decoration — see
                  CLAUDE.md, Translations. */}
              <h1 className={styles.heading}>
                <Trans i18nKey="login.heading" components={{ brand: <span key="brand" className={styles.headingBrand} /> }} />
              </h1>
              <p className={styles.subtitle}>{t('login.subtitle')}</p>
            </Enter>

            <Enter delay={step(2)}>
              <HeroCard
                eyebrow={t('login.heroEyebrow')}
                title={t('login.heroTitle')}
                subtitle={t('login.heroSubtitle')}
                icon={IoBarChart}
              />
            </Enter>
          </div>

          <div className={styles.formColumn}>
            <Enter delay={step(3)}>
              <SectionDivider label={t('login.divider')} className={styles.divider} />
            </Enter>

            <Enter delay={step(4)}>
              <form ref={cardRef} className={styles.card} onSubmit={handleSubmit} noValidate>
                {error ? <ErrorBanner key={error} message={error} className={styles.cardError} /> : null}

                <FormInput
                  label={t('login.email')}
                  icon={IoMailOutline}
                  placeholder={t('login.emailPlaceholder')}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) clearError();
                  }}
                />
                <FormInput
                  label={t('login.password')}
                  icon={IoLockClosedOutline}
                  placeholder={t('login.passwordPlaceholder')}
                  isPassword
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) clearError();
                  }}
                />

                <PrimaryButton
                  type="submit"
                  block
                  title={isSubmitting ? t('login.submitting') : t('login.submit')}
                  icon={IoArrowForward}
                  loading={isSubmitting}
                  disabled={!canSubmit}
                />
              </form>
            </Enter>

            <Enter delay={step(5)} className={styles.footerCard}>
              <InfoCard
                icon={IoStorefrontOutline}
                title={t('login.registerTitle')}
                subtitle={t('login.registerSubtitle')}
                to="/signup"
              />
            </Enter>

            <Enter delay={step(6)}>
              <p className={styles.footerNote}>{t('login.footer')}</p>
            </Enter>
          </div>
        </div>
      </div>
    </div>
  );
}
