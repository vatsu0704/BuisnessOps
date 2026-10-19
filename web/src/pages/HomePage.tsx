import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { IoConstructOutline, IoGitBranchOutline, IoRefresh, IoStorefrontOutline } from 'react-icons/io5';
import { QUICK_ACTIONS, isQuickActionVisible } from '@shared/constants/quickActions';
import NoBusinessAccessNotice from '@/components/NoBusinessAccessNotice';
import BranchCatalogSection from '@/components/home/BranchCatalogSection';
import BranchesSection from '@/components/home/BranchesSection';
import ExpenseGapsCard from '@/components/home/ExpenseGapsCard';
import { PaymentsCard, PaymentsToConfirmCard } from '@/components/home/PaymentsCards';
import PlanBanner from '@/components/home/PlanBanner';
import QuickActionsSection from '@/components/home/QuickActionsSection';
import RecentBillsSection from '@/components/home/RecentBillsSection';
import TodayPunchCard from '@/components/home/TodayPunchCard';
import TodaySection from '@/components/home/TodaySection';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import InfoCard from '@/components/ui/InfoCard';
import PhaseNotice from '@/components/ui/PhaseNotice';
import { useBranches } from '@/hooks/useBranches';
import { useMembership } from '@/hooks/useBusinessId';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMyStaffMember } from '@/hooks/useMyStaffMember';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useToday } from '@/hooks/useToday';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import { hasCapability, hasNoActiveBusiness, passesGate, type Gate } from '@/utils/permissions';
import styles from './HomePage.module.css';

/**
 * What Home shows and who sees each part — the app's Home section table, in its
 * order, with the same gates: a capability, narrowed with `hideWhen` where
 * holding it does not make it that person's job.
 *
 * `side` puts a section in the right-hand column on a wide window; narrower,
 * every section is one column in the app's order, so the quick actions come
 * straight after today's figures, as on the phone.
 */
type Section = Gate & { key: string; Component: ComponentType; side?: boolean };

const SECTIONS: Section[] = [
  // Punching in is a daily action, one click from opening the site. It needs no
  // capability — it is listed only for somebody with a staff record (below), so
  // an owner who does not punch gets no empty card.
  { key: 'punch', capability: null, Component: TodayPunchCard },
  { key: 'today', capability: 'analytics:viewToday', Component: TodaySection },
  // Ungated: each tile carries its own gate, and the section is dropped when none passes.
  { key: 'quickActions', capability: null, Component: QuickActionsSection, side: true },
  { key: 'recentBills', capability: 'counterOrder:create', Component: RecentBillsSection },
  // The back office's list of branches to ring (requirement 10).
  { key: 'expenseGaps', capability: 'expense:viewAllBranches', Component: ExpenseGapsCard },
  // Requirement 27 — what accounts has to pay for.
  { key: 'payments', capability: 'supplyPayment:settle', Component: PaymentsCard },
  // Requirement 26 — the desk's card; anyone who also pays has both lists behind
  // the card above, and two cards to one page is one too many.
  {
    key: 'paymentsToConfirm',
    capability: 'supplyPayment:verify',
    hideWhen: { holds: 'supplyPayment:settle' },
    Component: PaymentsToConfirmCard,
  },
  { key: 'branches', capability: 'branch:update', Component: BranchesSection },
  { key: 'catalog', capability: 'product:view', Component: BranchCatalogSection },
];

export default function HomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { isLoading, error, refresh, stats } = useBranches();
  const today = useToday();
  const { isStaff, refresh: refreshMyStaff } = useMyStaffMember();

  useDocumentTitle(t('tabs.home'));
  // A branch added, or a sale rung up on a phone, shows up when this page is
  // opened again or the tab comes back into view.
  const refreshAll = () => {
    void refresh();
    void today.refresh();
    // Somebody added to the roster on another device gets their punch card.
    void refreshMyStaff();
  };
  useRefreshOnFocus(refreshAll);

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? '';
  const noAccess = hasNoActiveBusiness(user);

  const hasQuickActions = QUICK_ACTIONS.some((action) =>
    isQuickActionVisible(action, (capability) => hasCapability(membership, capability))
  );
  const sections = SECTIONS.filter(
    (section) =>
      passesGate(membership, section) &&
      (section.key !== 'quickActions' || hasQuickActions) &&
      (section.key !== 'punch' || isStaff)
  );
  const mainSections = sections.filter((section) => !section.side);
  const sideSections = sections.filter((section) => section.side);

  // A branch-scoped member with no branch (requirement 18): say so, rather than
  // render cards with nothing in them. Somebody who can add a branch is invited
  // to; somebody who cannot is told to ask.
  const reachesEveryBranch = hasCapability(membership, 'branch:allAccess');
  const canAddBranch = hasCapability(membership, 'branch:create');
  const settled = !isLoading;
  const hasNoBranchAssigned = !!membership && !noAccess && !reachesEveryBranch && settled && stats.total === 0;
  const showAddFirstBranch = !error && !noAccess && settled && stats.total === 0 && canAddBranch;
  const roleHasNothingYet = sections.length === 0;

  const refreshing = isLoading || today.isLoading;

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
          onClick={refreshAll}
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

      {error || today.error ? (
        <Enter delay={step(1)}>
          <ErrorBanner message={(error || today.error) as string} />
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

      {!noAccess && sections.length > 0 ? (
        <div className={cx(styles.layout, mainSections.length > 0 && sideSections.length > 0 && styles.split)}>
          {/* Below the split each column is `display: contents`, so `order` lays
              every section out in the app's sequence. */}
          {[mainSections, sideSections].map((column, columnIndex) =>
            column.length > 0 ? (
              <div key={columnIndex} className={styles.column}>
                {column.map(({ key, Component }) => {
                  const order = sections.findIndex((section) => section.key === key);
                  return (
                    <Enter key={key} delay={step(Math.min(order + 1, 5))} style={{ order }}>
                      <Component />
                    </Enter>
                  );
                })}
              </div>
            ) : null
          )}
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
