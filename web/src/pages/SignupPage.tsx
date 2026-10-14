import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import {
  IoArrowForward,
  IoCloudUploadOutline,
  IoGitBranchOutline,
  IoLockClosedOutline,
  IoMailOpenOutline,
  IoMailOutline,
  IoPersonOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';
import { lookupInvite } from '@/api/team';
import BusinessFields, { isBusinessDraftComplete, type BusinessDraft } from '@/components/BusinessFields';
import AuthHeader from '@/components/layout/AuthHeader';
import ScreenBackground from '@/components/layout/ScreenBackground';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import InfoCard from '@/components/ui/InfoCard';
import PasswordStrength from '@/components/ui/PasswordStrength';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useShakeOnError } from '@/hooks/useShakeOnError';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import type { InviteLookupResult } from '@/types/team';
import { legalPageUrl } from '@/utils/legalLinks';
import { browserTimeZone } from '@/utils/timezone';
import { isValidEmail } from '@/utils/validation';
import styles from './AuthPage.module.css';

/**
 * Register a business — or, when the email already has a pending invite, join
 * the business that sent it, in which case the business details are not asked
 * for at all. The app's Signup screen, with the same rules.
 */
export default function SignupPage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [draft, setDraft] = useState<BusinessDraft>(() => ({
    name: '',
    industry: 'RETAIL',
    country: 'IN',
    defaultCurrency: 'INR',
    timezone: browserTimeZone(),
  }));
  const [inviteInfo, setInviteInfo] = useState<InviteLookupResult | null>(null);

  const signup = useAuthStore((s) => s.signup);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const errorRef = useShakeOnError<HTMLDivElement>(error);
  useDocumentTitle(t('signup.heading'));

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);
  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;
  const isInviteMode = !!inviteInfo;

  // Someone invited before they had an account joins that business with the
  // role already chosen, instead of creating a business that would be thrown
  // away. Debounced so it does not fire on every keystroke.
  useEffect(() => {
    if (!isValidEmail(emailTrimmed)) {
      setInviteInfo(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      lookupInvite(emailTrimmed)
        .then((result) => {
          if (!cancelled) setInviteInfo(result);
        })
        .catch(() => {
          if (!cancelled) setInviteInfo(null);
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [emailTrimmed]);

  const canSubmit =
    name.trim().length > 0 &&
    emailTrimmed.length > 0 &&
    !emailInvalid &&
    password.length >= 8 &&
    password === confirmPassword &&
    (isInviteMode || isBusinessDraftComplete(draft)) &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      await signup({
        name: name.trim(),
        email: emailTrimmed.toLowerCase(),
        password,
        ...(isInviteMode
          ? {}
          : {
              businessName: draft.name.trim(),
              industry: draft.industry,
              country: draft.country.trim(),
              defaultCurrency: draft.defaultCurrency.trim(),
              timezone: draft.timezone.trim(),
            }),
      });
    } catch {
      // The store holds the message and the banner shows it.
    }
  }

  function onFieldChange(setter: (text: string) => void) {
    return (event: { target: { value: string } }) => {
      setter(event.target.value);
      if (error) clearError();
    };
  }

  return (
    <div className={styles.page}>
      <ScreenBackground />
      <div className={styles.container}>
        <Enter delay={step(0)} className={styles.header}>
          <AuthHeader backTo="/login" caption={t('signup.headerCaption')} />
        </Enter>

        <div className={styles.signupGrid}>
          {/* The intro and the data note: a sticky column beside the form on a
              wide window, and on a narrow one two separate rows either side of it. */}
          <div className={styles.signupSide}>
            <Enter delay={step(1)} className={`${styles.signupIntro} ${styles.introText}`}>
              <Pill label={t('signup.pill')} icon={IoGitBranchOutline} />
              <h1 className={styles.heading}>{t('signup.heading')}</h1>
              <p className={styles.subtitle}>{t('signup.subtitle')}</p>
            </Enter>

            <Enter delay={step(5)} className={styles.signupAside}>
              <InfoCard icon={IoCloudUploadOutline} title={t('signup.dataTitle')} subtitle={t('signup.dataSubtitle')} />
            </Enter>
          </div>

          <form className={styles.signupForm} onSubmit={handleSubmit} noValidate>
            {error ? (
              <div ref={errorRef} className={styles.cardError}>
                <ErrorBanner key={error} message={error} />
              </div>
            ) : null}

            <Enter delay={step(2)} as="section" className={`${styles.card} ${styles.signupCard}`}>
              <h2 className={styles.sectionTitle}>{t('signup.accountSection')}</h2>

              <FormInput
                label={t('signup.fullName')}
                icon={IoPersonOutline}
                placeholder={t('signup.fullNamePlaceholder')}
                autoComplete="name"
                autoFocus
                value={name}
                onChange={onFieldChange(setName)}
              />
              <FormInput
                label={t('signup.email')}
                icon={IoMailOutline}
                placeholder={t('signup.emailPlaceholder')}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={onFieldChange(setEmail)}
                error={emailInvalid ? t('signup.emailInvalid') : null}
              />
              {inviteInfo ? (
                <p className={styles.inviteBanner} role="status">
                  <IoMailOpenOutline size={16} aria-hidden="true" />
                  <span>
                    {t('signup.invitedAs', {
                      businessName: inviteInfo.businessName,
                      role: t(`role.${inviteInfo.role}`),
                    })}
                  </span>
                </p>
              ) : null}
              <FormInput
                label={t('signup.createPassword')}
                hint={t('signup.passwordHint')}
                icon={IoLockClosedOutline}
                placeholder={t('signup.passwordPlaceholder')}
                isPassword
                autoComplete="new-password"
                value={password}
                onChange={onFieldChange(setPassword)}
              />
              <PasswordStrength password={password} />
              <FormInput
                label={t('signup.confirmPassword')}
                icon={IoShieldCheckmarkOutline}
                placeholder={t('signup.confirmPlaceholder')}
                isPassword
                autoComplete="new-password"
                value={confirmPassword}
                onChange={onFieldChange(setConfirmPassword)}
                error={passwordsMatch ? null : t('signup.mismatch')}
              />
            </Enter>

            {!isInviteMode ? (
              <Enter delay={step(3)} as="section" className={`${styles.card} ${styles.signupCard}`}>
                <h2 className={styles.sectionTitle}>{t('signup.businessSection')}</h2>

                <BusinessFields
                  value={draft}
                  onChange={(next) => {
                    setDraft(next);
                    if (error) clearError();
                  }}
                  labels={{
                    name: t('signup.businessName'),
                    namePlaceholder: t('signup.businessNamePlaceholder'),
                    industry: t('signup.industry'),
                    country: t('signup.country'),
                    currency: t('signup.currency'),
                    timezone: t('signup.timezone'),
                  }}
                />
              </Enter>
            ) : null}

            <Enter delay={step(4)} className={styles.submitBlock}>
              <PrimaryButton
                type="submit"
                block
                title={
                  isSubmitting
                    ? t('signup.submitting')
                    : isInviteMode
                      ? t('signup.joinSubmit', { businessName: inviteInfo?.businessName })
                      : t('signup.submit')
                }
                icon={IoArrowForward}
                loading={isSubmitting}
                disabled={!canSubmit}
              />
              {/* One sentence with the link tagged inside it: the Indic languages
                  put the policy's name before the verb. The tag is <policy> —
                  Trans reads <link> as the void HTML element and empties it. The
                  key is not decoration — see CLAUDE.md, Translations. */}
              <p className={styles.privacy}>
                <Trans
                  i18nKey="signup.privacyNotice"
                  components={{
                    policy: <a key="policy" href={legalPageUrl('privacy')} target="_blank" rel="noopener noreferrer" />,
                  }}
                />
              </p>
              <Link to="/login" className={styles.switchLink}>
                {t('signup.haveAccount')} <strong>{t('signup.logIn')}</strong>
              </Link>
            </Enter>
          </form>

        </div>
      </div>
    </div>
  );
}
