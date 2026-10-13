import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  IoAddCircleOutline,
  IoCalendarOutline,
  IoFingerPrintOutline,
  IoLogOutOutline,
  IoPeopleCircleOutline,
  IoQrCodeOutline,
  IoRibbonOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';
import NoBusinessAccessNotice from '@/components/NoBusinessAccessNotice';
import BusinessSwitcher from '@/components/settings/BusinessSwitcher';
import LanguageSelector from '@/components/settings/LanguageSelector';
import NotificationSettings from '@/components/settings/NotificationSettings';
import Button from '@/components/ui/Button';
import Card, { DetailRows } from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import InfoCard from '@/components/ui/InfoCard';
import PageHeader from '@/components/ui/PageHeader';
import { useBranches } from '@/hooks/useBranches';
import { useMembership } from '@/hooks/useBusinessId';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import { legalPageUrl } from '@/utils/legalLinks';
import { initials } from '@/utils/initials';
import { hasCapability, hasNoActiveBusiness } from '@/utils/permissions';
import { subscriptionStatusLabel } from '@shared/constants/plans';
import { planName } from '@shared/permissions/explain';
import styles from './SettingsPage.module.css';

/**
 * The app's Settings screen: who you are, which business, the set-up-once pages,
 * the language, the privacy policy and the way out. On a wide window the facts sit
 * on the left and the things to change on the right; narrower, it is the app's
 * single column in the app's order.
 */
export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const logout = useAuthStore((s) => s.logout);
  const membership = useMembership();
  const { stats } = useBranches();

  const noAccess = hasNoActiveBusiness(user);
  // Starting a business is the owner's act. Someone revoked from every business
  // holds no capability at all, and is offered it too — otherwise the account
  // would have nothing left it could do.
  const canAddBusiness = hasCapability(membership, 'business:create') || noAccess;

  return (
    <div>
      <PageHeader title={t('settings.title')} />

      <div className={styles.grid}>
        <div className={styles.column}>
          <Enter delay={step(0)}>
            <div className={styles.profile}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(user?.name, user?.email)}
              </span>
              <div className={styles.profileText}>
                <p className={styles.profileName}>{user?.name ?? user?.email}</p>
                <p className={styles.profileEmail}>{user?.email}</p>
              </div>
            </div>
          </Enter>

          <Enter delay={step(1)}>
            <Card title={t('settings.account')}>
              <DetailRows
                rows={[
                  { label: t('settings.email'), value: user?.email ?? '—' },
                  ...(membership ? [{ label: t('settings.role'), value: t(`role.${membership.role}`) }] : []),
                ]}
              />
            </Card>
          </Enter>

          <Enter delay={step(2)}>
            <BusinessSwitcher />
          </Enter>

          {canAddBusiness ? (
            <Enter delay={step(2)}>
              <InfoCard
                icon={IoAddCircleOutline}
                title={t('settings.addBusiness')}
                subtitle={t('settings.addBusinessSubtitle')}
                to={pathTo('addBusiness')}
              />
            </Enter>
          ) : null}

          {noAccess ? (
            <Enter delay={step(2)}>
              <NoBusinessAccessNotice />
            </Enter>
          ) : null}

          {business ? (
            <Enter delay={step(3)}>
              <Card title={t('settings.business')}>
                <DetailRows
                  rows={[
                    { label: t('settings.name'), value: business.name },
                    { label: t('settings.industry'), value: t(`industry.${business.industry}`) },
                    { label: t('settings.branches'), value: String(stats.trading) },
                    { label: t('settings.country'), value: business.country },
                    { label: t('settings.currency'), value: business.defaultCurrency },
                    { label: t('settings.timezone'), value: business.timezone },
                  ]}
                />
              </Card>
            </Enter>
          ) : null}
        </div>

        <div className={styles.column}>
          <Enter delay={step(4)} className={styles.links}>
            {/* Requirement 28 — the plan. The owner's alone: an admin runs the
                business, its bill is not theirs. */}
            {hasCapability(membership, 'billing:manage') && membership?.business.subscription ? (
              <InfoCard
                icon={IoRibbonOutline}
                title={t('plans.title')}
                subtitle={t('plans.settingsSubtitle', {
                  plan: planName(membership.business.subscription.plan),
                  status: subscriptionStatusLabel(membership.business.subscription, t),
                })}
                to={pathTo('plan')}
              />
            ) : null}
            <InfoCard
              icon={IoFingerPrintOutline}
              title={t('settings.attendance')}
              subtitle={t('settings.attendanceSubtitle')}
              to={pathTo('attendance')}
            />
            {/* The things set up once and then left alone. */}
            {hasCapability(membership, 'workCalendar:manage') ? (
              <InfoCard
                icon={IoCalendarOutline}
                title={t('workCalendar.title')}
                subtitle={t('workCalendar.weeklyOffHint')}
                to={pathTo('workCalendar')}
              />
            ) : null}
            {hasCapability(membership, 'team:view') ? (
              <InfoCard
                icon={IoPeopleCircleOutline}
                title={t('settings.team')}
                subtitle={t('settings.teamSubtitle')}
                to={pathTo('team')}
              />
            ) : null}
            {hasCapability(membership, 'paymentAccount:manage') ? (
              <InfoCard
                icon={IoQrCodeOutline}
                title={t('paymentAccounts.title')}
                subtitle={t('paymentAccounts.settingsSubtitle')}
                to={pathTo('paymentAccounts')}
              />
            ) : null}
          </Enter>

          <Enter delay={step(5)}>
            <LanguageSelector />
          </Enter>

          {/* Below the language on purpose, as in the app: what a notification says
              is decided by the language above. */}
          <Enter delay={step(6)}>
            <NotificationSettings />
          </Enter>

          <Enter delay={step(7)}>
            <InfoCard
              icon={IoShieldCheckmarkOutline}
              title={t('settings.privacyPolicy')}
              subtitle={t('settings.privacyPolicySubtitle')}
              href={legalPageUrl('privacy')}
            />
          </Enter>

          <Enter delay={step(8)} className={styles.exit}>
            <Button
              variant="danger"
              icon={IoLogOutOutline}
              title={t('settings.logout')}
              block
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            />
            {/* Quieter than Log out on purpose: easy to find, never the thing a
                hand lands on reaching for the button above. */}
            <Link to={pathTo('deleteAccount')} className={styles.deleteLink}>
              {t('settings.deleteAccount')}
            </Link>
          </Enter>
        </div>
      </div>
    </div>
  );
}
