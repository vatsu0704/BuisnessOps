import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { IconType } from 'react-icons';
import { IoAlertCircleOutline, IoChevronForward, IoLockClosedOutline, IoTimeOutline } from 'react-icons/io5';
import { planBanner, planBannerText, type PlanBannerKind } from '@shared/constants/plans';
import Enter from '@/components/ui/Enter';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { Membership } from '@/types/user';
import { cx } from '@/utils/cx';
import { hasCapability } from '@/utils/permissions';
import styles from './PlanBanner.module.css';

const ICONS: Record<PlanBannerKind, IconType> = {
  trialEnding: IoTimeOutline,
  grace: IoAlertCircleOutline,
  readOnly: IoLockClosedOutline,
};

/**
 * Requirement 28 — the plan on Home, only when there is something to say: a
 * trial in its last days or a lapsed plan's grace (to the owner, who alone can
 * act on either), or read-only (to everyone, since it is why their next save is
 * refused). The rule is shared with the app's banner (`constants/plans.ts`).
 *
 * The sentence and the link are stacked, not side by side — a row of two
 * growing things is the row that breaks in Gujarati.
 */
export default function PlanBanner({ membership }: { membership: Membership | undefined }) {
  const { t } = useTranslation();
  const isOwner = hasCapability(membership, 'billing:manage');
  const banner = planBanner(membership?.business.subscription, isOwner);
  if (!banner) return null;

  const Icon = ICONS[banner.kind];
  return (
    <Enter delay={step(1)}>
      <div className={cx(styles.banner, styles[banner.kind])} role="status" data-testid={`plan-banner-${banner.kind}`}>
        <p className={styles.message}>
          <Icon className={styles.icon} aria-hidden="true" />
          <span>{planBannerText(banner, t)}</span>
        </p>
        {isOwner ? (
          <Link to={pathTo('plan')} className={styles.link}>
            {t('plans.banner.seePlan')}
            <IoChevronForward aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </Enter>
  );
}
