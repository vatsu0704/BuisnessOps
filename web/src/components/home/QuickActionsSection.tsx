import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  IoArrowForward,
  IoBarChartOutline,
  IoBicycleOutline,
  IoCalculatorOutline,
  IoCartOutline,
  IoCloudUploadOutline,
  IoCubeOutline,
  IoFileTrayFullOutline,
  IoPricetagsOutline,
  IoReceiptOutline,
  IoTimeOutline,
  IoWalletOutline,
} from 'react-icons/io5';
import {
  QUICK_ACTIONS,
  isQuickActionVisible,
  quickActionLabelKey,
  type QuickActionKey,
  type QuickActionRoute,
} from '@shared/constants/quickActions';
import type { GatedRoute } from '@shared/navigation/routeCapabilities';
import { useMembership } from '@/hooks/useBusinessId';
import { useToday } from '@/hooks/useToday';
import { pathForAppRoute } from '@/routes/paths';
import { formatAmount } from '@/utils/format';
import { hasCapability } from '@/utils/permissions';
import styles from './QuickActionsSection.module.css';

/** Every route a tile names is a gated app route — a renamed screen fails `tsc` here. */
type UnknownRoute = Exclude<QuickActionRoute, GatedRoute>;
const everyRouteIsGated: [UnknownRoute] extends [never] ? true : UnknownRoute = true;
void everyRouteIsGated;

/** The web's icon for each tile — a `Record`, so a new tile fails `tsc` until it has one. */
const ICONS: Record<QuickActionKey, IconType> = {
  billing: IoCalculatorOutline,
  items: IoPricetagsOutline,
  expenses: IoWalletOutline,
  reports: IoBarChartOutline,
  supply: IoCartOutline,
  rawMaterial: IoCubeOutline,
  orders: IoReceiptOutline,
  desk: IoFileTrayFullOutline,
  deliveries: IoBicycleOutline,
  paymentHistory: IoTimeOutline,
  upload: IoCloudUploadOutline,
};

/**
 * Home's quick actions (requirement 33) — the app's tile grid, from the same
 * shared table, so a tile and who sees it cannot differ between the two.
 *
 * The till leads, drawn large with today's takings on it. The rest are tiles as
 * many across as the column holds; their labels wrap rather than shrink or cut,
 * since every Indic translation runs longer than the English.
 */
export default function QuickActionsSection() {
  const { t } = useTranslation();
  const membership = useMembership();
  const { today } = useToday();

  const actions = QUICK_ACTIONS.filter((action) =>
    isQuickActionVisible(action, (capability) => hasCapability(membership, capability))
  )
    .map((action) => ({ action, to: pathForAppRoute(action.route, action.params) }))
    .filter((entry): entry is { action: (typeof QUICK_ACTIONS)[number]; to: string } => entry.to !== null);
  if (actions.length === 0) return null;

  const primary = actions.find(({ action }) => action.primary) ?? null;
  const PrimaryIcon = primary ? ICONS[primary.action.key] : null;
  const tiles = actions.filter(({ action }) => !action.primary);

  return (
    <section className={styles.wrap} aria-labelledby="home-quick-actions-title">
      <h2 id="home-quick-actions-title" className={styles.title}>
        {t('quickActions.title')}
      </h2>

      {primary && PrimaryIcon ? (
        <Link to={primary.to} className={styles.primary}>
          <span className={styles.primaryIcon} aria-hidden="true">
            <PrimaryIcon size={24} />
          </span>
          <span className={styles.primaryText}>
            <span className={styles.primaryLabel}>{t(quickActionLabelKey(primary.action.key))}</span>
            {today ? (
              <span className={styles.primaryCaption}>
                {t('quickActions.billingToday', {
                  amount: formatAmount(Number(today.totals.sales), today.currency),
                  count: today.totals.saleCount,
                })}
              </span>
            ) : null}
          </span>
          <IoArrowForward size={20} className={styles.primaryArrow} aria-hidden="true" />
        </Link>
      ) : null}

      {tiles.length > 0 ? (
        <ul className={styles.grid}>
          {tiles.map(({ action, to }) => {
            const Icon = ICONS[action.key];
            return (
              <li key={action.key}>
                <Link to={to} className={styles.tile}>
                  <span className={styles.iconCircle} aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <span className={styles.tileLabel}>{t(quickActionLabelKey(action.key))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
