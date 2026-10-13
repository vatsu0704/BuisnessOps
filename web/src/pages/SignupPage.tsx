import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import {
  IoArrowForward,
  IoBriefcaseOutline,
  IoBusinessOutline,
  IoCashOutline,
  IoCloudUploadOutline,
  IoConstructOutline,
  IoFlagOutline,
  IoGitBranchOutline,
  IoLockClosedOutline,
  IoMailOpenOutline,
  IoMailOutline,
  IoPersonOutline,
  IoRestaurantOutline,
  IoShieldCheckmarkOutline,
  IoStorefrontOutline,
  IoTimeOutline,
} from 'react-icons/io5';
import type { IconType } from 'react-icons';
import { lookupInvite } from '@/api/team';
import AuthHeader from '@/components/layout/AuthHeader';
import ScreenBackground from '@/components/layout/ScreenBackground';
import ChoiceTile from '@/components/ui/ChoiceTile';
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
import type { Industry } from '@/types/business';
import type { InviteLookupResult } from '@/types/team';
import { legalPageUrl } from '@/utils/legalLinks';
import { isValidEmail } from '@/utils/validation';
import styles from './AuthPage.module.css';

/** The industry picker's options, in the app's order (constants/industries.ts there). */
const INDUSTRY_OPTIONS: { value: Industry; icon: IconType }[] = [
  { value: 'RETAIL', icon: IoStorefrontOutline },
  { value: 'FOOD_BEVERAGE', icon: IoRestaurantOutline },
  { value: 'SERVICES', icon: IoConstructOutline },
  { value: 'FRANCHISE_OTHER', icon: IoBusinessOutline },
];

/**
 * Chrome still reports some zones by their pre-2000s names — India as
 * "Asia/Calcutta". Both are valid, but the rest of the app writes the current
 * name, and a business's timezone is shown back to its owner.
 */
const LEGACY_ZONES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
};

/**
 * The browser knows its own time zone, which the phone (without a dependable
 * Intl) cannot tell the app — so the web starts from it rather than from
 * Asia/Kolkata, and the owner can still change it.
 */
function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (zone && LEGACY_ZONES[zone]) || zone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/**
 * Register a business — or, when the email already has a pending invite, join
 * the business that sent it, in which case the business details are not asked
 * for at all. The app's Signup screen, with the same rules.
 */
export default function SignupPage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [industry, setIndustry] = useState<Industry>('RETAIL');
  const [country, setCountry] = useState('IN');
  const [defaultCurrency, setDefaultCurrency] = useState('INR');
  const [timezone, setTimezone] = useState(browserTimeZone);
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
    (isInviteMode ||
      (businessName.trim().length > 0 &&
        country.trim().length > 0 &&
        defaultCurrency.trim().length > 0 &&
        timezone.trim().length > 0)) &&
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
              businessName: businessName.trim(),
              industry,
              country: country.trim(),
              defaultCurrency: defaultCurrency.trim(),
              timezone: timezone.trim(),
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

                <FormInput
                  label={t('signup.businessName')}
                  icon={IoBriefcaseOutline}
                  placeholder={t('signup.businessNamePlaceholder')}
                  autoComplete="organization"
                  value={businessName}
                  onChange={onFieldChange(setBusinessName)}
                />

                <fieldset className={styles.choiceGrid}>
                  <legend className={styles.fieldLabel}>{t('signup.industry')}</legend>
                  {INDUSTRY_OPTIONS.map((option) => (
                    <ChoiceTile
                      key={option.value}
                      name="industry"
                      value={option.value}
                      title={t(`industry.${option.value}`)}
                      caption={t(`industry.${option.value}_caption`)}
                      icon={option.icon}
                      selected={industry === option.value}
                      onSelect={() => setIndustry(option.value)}
                    />
                  ))}
                </fieldset>

                <div className={styles.pair}>
                  <FormInput
                    label={t('signup.country')}
                    icon={IoFlagOutline}
                    autoCapitalize="characters"
                    autoComplete="country"
                    value={country}
                    onChange={onFieldChange((v) => setCountry(v.toUpperCase()))}
                  />
                  <FormInput
                    label={t('signup.currency')}
                    icon={IoCashOutline}
                    autoCapitalize="characters"
                    value={defaultCurrency}
                    onChange={onFieldChange((v) => setDefaultCurrency(v.toUpperCase()))}
                  />
                </div>

                <FormInput
                  label={t('signup.timezone')}
                  icon={IoTimeOutline}
                  value={timezone}
                  onChange={onFieldChange(setTimezone)}
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
                  Trans reads <link> as the void HTML element and empties it. */}
              <p className={styles.privacy}>
                <Trans
                  i18nKey="signup.privacyNotice"
                  components={{ policy: <a href={legalPageUrl('privacy')} target="_blank" rel="noopener noreferrer" /> }}
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
