import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  IoBicycleOutline,
  IoCalculatorOutline,
  IoCloudUploadOutline,
  IoConstructOutline,
  IoCubeOutline,
  IoFileTrayFullOutline,
  IoGitBranchOutline,
  IoPricetagsOutline,
  IoReceiptOutline,
  IoRefresh,
  IoStorefrontOutline,
  IoWalletOutline,
} from 'react-icons/io5';
import NoBusinessAccessNotice from '@/components/NoBusinessAccessNotice';
import BranchCatalogSection from '@/components/home/BranchCatalogSection';
import BranchesSection from '@/components/home/BranchesSection';
import SalesTilesSection from '@/components/home/SalesTilesSection';
import PlanBanner from '@/components/home/PlanBanner';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import InfoCard from '@/components/ui/InfoCard';
import PhaseNotice from '@/components/ui/PhaseNotice';
import { useBranches } from '@/hooks/useBranches';
import { useMembership } from '@/hooks/useBusinessId';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useSalesSummary } from '@/hooks/useSalesSummary';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import { hasCapability, hasNoActiveBusiness, passesGate, type Gate } from '@/utils/permissions';
import styles from './HomePage.module.css';

/**
 * What Home shows and who sees each part — the app's Home section table, split
 * into the numbers and lists people *read* (the main column) and the doors to
 * their daily work (shortcuts).
 *
 * Gates are the app's, unchanged: a capability, narrowed with `hideWhen` where
 * holding it does not make it that person's job.
 *
 * Not yet on the web, and so not listed: today's punch card, the branches to
 * chase for expenses, and the two supply-payment cards. Each comes with the page
 * it belongs to.
 */
const MAIN_SECTIONS: (Gate & { key: string; Component: ComponentType })[] = [
  { key: 'sales', capability: 'analytics:viewBranch', Component: SalesTilesSection },
  { key: 'branches', capability: 'branch:update', Component: BranchesSection },
  { key: 'catalog', capability: 'product:view', Component: BranchCatalogSection },
];

type ShortcutKey =
  | 'counter'
  | 'expenses'
  | 'supply'
  | 'supplyCatalog'
  | 'desk'
  | 'deliveries'
  | 'supplyTrack'
  | 'data';

const SHORTCUTS: (Gate & { key: ShortcutKey; icon: IconType; to: string })[] = [
  { key: 'counter', capability: 'counterOrder:create', icon: IoCalculatorOutline, to: '/counter' },
  { key: 'expenses', capability: 'expense:log', icon: IoWalletOutline, to: '/expenses' },
  // A branch orders raw material; an admin does not.
  {
    key: 'supply',
    capability: 'supplyOrder:create',
    hideWhen: { holds: 'analytics:viewBusiness' },
    icon: IoCubeOutline,
    to: '/supply',
  },
  { key: 'supplyCatalog', capability: 'supplyItem:manage', icon: IoPricetagsOutline, to: '/supply' },
  { key: 'desk', capability: 'supplyOrder:fulfil', icon: IoFileTrayFullOutline, to: '/desk' },
  // Whoever runs the desk is not who carries the run.
  {
    key: 'deliveries',
    capability: 'supplyOrder:deliver',
    hideWhen: { holds: 'supplyOrder:fulfil' },
    icon: IoBicycleOutline,
    to: '/deliveries',
  },
  { key: 'supplyTrack', capability: 'supplyOrder:view', icon: IoReceiptOutline, to: '/supply-orders' },
  { key: 'data', capability: 'dataSource:manage', icon: IoCloudUploadOutline, to: '/upload' },
];

export default function HomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { isLoading, error, refresh, stats } = useBranches();
  const sales = useSalesSummary();

  useDocumentTitle(t('tabs.home'));
  // A branch added, or a sale rung up on a phone, shows up when this page is
  // opened again or the tab comes back into view.
  useRefreshOnFocus(() => {
    void refresh();
    void sales.refresh();
  });

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? '';
  const noAccess = hasNoActiveBusiness(user);

  const mainSections = MAIN_SECTIONS.filter((section) => passesGate(membership, section));
  const shortcuts = SHORTCUTS.filter((shortcut) => passesGate(membership, shortcut));

  // A branch-scoped member with no branch (requirement 18): say so, rather than
  // render cards with nothing in them. Somebody who can add a branch is invited
  // to; somebody who cannot is told to ask.
  const reachesEveryBranch = hasCapability(membership, 'branch:allAccess');
  const canAddBranch = hasCapability(membership, 'branch:create');
  const settled = !isLoading;
  const hasNoBranchAssigned = !!membership && !noAccess && !reachesEveryBranch && settled && stats.total === 0;
  const showAddFirstBranch = !error && !noAccess && settled && stats.total === 0 && canAddBranch;
  const roleHasNothingYet = mainSections.length === 0 && shortcuts.length === 0;

  const refreshing = isLoading || sales.isLoading;

  return (
    <div className={styles.page}>
      <Enter delay={step(0)} className={styles.greetingRow}>
        <div className={styles.greetingBlock}>
          <h1 className={styles.greeting}>{t('home.greeting', { name: firstName })}</h1>
          <div className={styles.businessRow}>
            {business ? <p className={styles.business}>{business.name}</p> : null}
            <span className={styles.branchChip}>
              <IoGitBranchOutline size={13} aria-hidden="true" />
              {t('home.branchCount', { count: stats.total })}
            </span>
          </div>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => {
            void refresh();
            void sales.refresh();
          }}
          disabled={refreshing}
          aria-label={t('web.home.refresh')}
          title={t('web.home.refresh')}
        >
          <IoRefresh size={18} className={cx(refreshing && styles.spinning)} aria-hidden="true" />
        </button>
      </Enter>

      {noAccess ? (
        <Enter delay={step(1)}>
          <NoBusinessAccessNotice />
        </Enter>
      ) : null}

      {/* Requirement 28: nothing unless the plan is ending, in grace, or read-only. */}
      <PlanBanner membership={membership} />

      {error || sales.error ? (
        <Enter delay={step(1)}>
          <ErrorBanner message={(error || sales.error) as string} />
        </Enter>
      ) : null}

      {showAddFirstBranch ? (
        <Enter delay={step(1)}>
          <InfoCard
            icon={IoStorefrontOutline}
            title={t('home.emptyTitle')}
            subtitle={t('home.emptySubtitle')}
            to={pathTo('addBranch')}
          />
        </Enter>
      ) : null}

      {!error && hasNoBranchAssigned && !canAddBranch ? (
        <Enter delay={step(1)}>
          <PhaseNotice
            icon={IoGitBranchOutline}
            badge={t('home.noBranchBadge')}
            title={t('home.noBranchTitle')}
            body={t('home.noBranchBody')}
          />
        </Enter>
      ) : null}

      {!noAccess && (mainSections.length > 0 || shortcuts.length > 0) ? (
        <div className={cx(styles.layout, mainSections.length > 0 && shortcuts.length > 0 && styles.split)}>
          {mainSections.length > 0 ? (
            <div className={styles.column}>
              {mainSections.map(({ key, Component }, index) => (
                <Enter key={key} delay={step(Math.min(index + 1, 5))}>
                  <Component />
                </Enter>
              ))}
            </div>
          ) : null}

          {shortcuts.length > 0 ? (
            <Enter delay={step(2)} as="section" className={styles.shortcuts}>
              <h2 className={styles.shortcutsTitle}>{t('web.home.shortcuts')}</h2>
              <ul className={styles.shortcutList}>
                {shortcuts.map((shortcut) => (
                  <li key={shortcut.key}>
                    <InfoCard
                      icon={shortcut.icon}
                      title={t(`home.${shortcut.key}Title`)}
                      subtitle={t(`home.${shortcut.key}Subtitle`)}
                      to={shortcut.to}
                    />
                  </li>
                ))}
              </ul>
            </Enter>
          ) : null}
        </div>
      ) : null}

      {roleHasNothingYet && !noAccess && !hasNoBranchAssigned ? (
        <Enter delay={step(2)}>
          <PhaseNotice
            icon={IoConstructOutline}
            badge={t('home.roleEmptyBadge')}
            title={t('home.roleEmptyTitle')}
            body={t('home.roleEmptyBody')}
          />
        </Enter>
      ) : null}
    </div>
  );
}
