import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IoCloseCircleOutline,
  IoCloseOutline,
  IoPersonAddOutline,
  IoPersonRemoveOutline,
  IoSwapHorizontalOutline,
} from 'react-icons/io5';
import { isDeletedAccount } from '@shared/utils/account';
import {
  asAssignmentConflict,
  canRemoveMember,
  hasCashierConflicts,
  isSingleBranchRole,
  reachesEveryBranch,
} from '@shared/utils/teamRules';
import { extractErrorMessage } from '@/api/client';
import { assignBranchAccess, removeBranchAccess, revokeInvite, revokeMembership } from '@/api/team';
import CashierBranchPicker from '@/components/team/CashierBranchPicker';
import ConflictPanel from '@/components/team/ConflictPanel';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import InfoCard from '@/components/ui/InfoCard';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import Spinner from '@/components/ui/Spinner';
import Picker from '@/components/ui/Picker';
import SearchField from '@/components/ui/SearchField';
import { useBranches } from '@/hooks/useBranches';
import { filterInvites, filterMembers } from '@shared/utils/teamFilter';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useCashierByBranch, useTeam } from '@/hooks/useTeam';
import { canOpenRoute, pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { PendingInvite, TeamMember } from '@/types/team';
import { confirm } from '@/utils/confirm';
import { cx } from '@/utils/cx';
import { hasCapability } from '@/utils/permissions';
import styles from './TeamPage.module.css';

/**
 * Who works here, and what they can reach — the app's Team screen.
 *
 * Pending invites first, then every member as a card in a grid that wraps: an
 * owner's or manager's reach is "every branch", a cashier's is one branch that
 * *moves* (requirement 18), and anyone else's is a set of branches removed one at
 * a time. Every change asks first where it cannot be undone, then reloads from the
 * server rather than patching the list — the server decides what a revoke means.
 *
 * The rules — who reaches every branch, who may remove whom, what a 409 says —
 * are `@shared/utils/teamRules`, the same file the app's screen reads.
 */
/** How many people a page shows before asking. */
const PAGE = 20;
/** The branch filter's "every branch" row. Not a branch id, so it cannot collide. */
const ALL = '__all__';

export default function TeamPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const viewer = useMembership();
  const { members, invites, conflicts, isLoading, error: loadError, refresh } = useTeam();
  const [query, setQuery] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const cashierByBranch = useCashierByBranch();
  const { tradingBranches } = useBranches();
  useRefreshOnFocus(refresh, { onMount: false });
  // Each action asks for the capability its endpoint is guarded by, so a button
  // that shows is a button whose request succeeds.
  const canRevoke = hasCapability(viewer, 'team:revoke');
  const canManageBranches = hasCapability(viewer, 'team:manageBranchAccess');

  const [error, setError] = useState<string | null>(null);
  // Which row has a request in flight, so a slow network cannot be clicked into two revokes.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which cashier's branch picker is open. One at a time: two open pickers are two half-made decisions.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  async function confirmAndRun(rowId: string, title: string, body: string, confirmLabel: string, run: () => Promise<void>) {
    const ok = await confirm({ title, body, confirmLabel, cancelLabel: t('common.cancel') });
    if (!ok) return;
    setBusyId(rowId);
    setError(null);
    try {
      await run();
      await refresh();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function onRevokeInvite(invite: PendingInvite) {
    if (!businessId) return;
    void confirmAndRun(
      invite.id,
      t('team.revokeInviteTitle'),
      t('team.revokeInviteBody', { email: invite.email }),
      t('team.revokeInvite'),
      () => revokeInvite(businessId, invite.id)
    );
  }

  function onRemoveMember(member: TeamMember) {
    if (!businessId) return;
    void confirmAndRun(
      member.id,
      t('team.removeMemberTitle', { name: member.user.name ?? member.user.email }),
      t('team.removeMemberBody'),
      t('team.removeMember'),
      () => revokeMembership(businessId, member.id)
    );
  }

  function onRemoveBranch(member: TeamMember, branch: { id: string; name: string }) {
    if (!businessId) return;
    void confirmAndRun(
      member.id,
      t('team.removeBranchTitle'),
      t('team.removeBranchBody', { name: member.user.name ?? member.user.email, branch: branch.name }),
      t('common.remove'),
      () => removeBranchAccess(businessId, member.id, branch.id)
    );
  }

  /**
   * Requirement 18 — give a cashier a branch, or move them to another.
   *
   * The request goes first and the question is asked only if the server objects:
   * this page could predict the clash from its own list, but that would be two
   * places deciding one rule, one of them a few seconds out of date. The 409 names
   * the blocker, and the retry is the same request with `confirm`.
   */
  async function onAssignBranch(member: TeamMember, branchId: string) {
    if (!businessId) return;
    if (member.branchAccess[0]?.branch.id === branchId) {
      setPickerFor(null);
      return;
    }
    const name = member.user.name ?? member.user.email;
    setBusyId(member.id);
    setError(null);
    try {
      await assignBranchAccess(businessId, member.id, branchId);
    } catch (err) {
      const conflict = asAssignmentConflict(err);
      setBusyId(null);
      if (!conflict) {
        setError(extractErrorMessage(err));
        return;
      }
      // Two sentences, each its own key: displacing a cashier and vacating a branch
      // are separate consequences, and one template cannot carry both in four languages.
      const displaces = conflict.code === 'BRANCH_ALREADY_HAS_CASHIER';
      const body = displaces
        ? [
            t('team.swapBody', { branch: conflict.branch, cashier: conflict.cashier, name }),
            conflict.currentBranch ? t('team.swapAlsoVacates', { currentBranch: conflict.currentBranch }) : '',
          ]
            .filter(Boolean)
            .join(' ')
        : t('team.moveBody', { branch: conflict.branch, currentBranch: conflict.currentBranch, name });
      const ok = await confirm({
        title: displaces ? t('team.swapTitle') : t('team.moveTitle'),
        body,
        confirmLabel: t('team.swapConfirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
      setBusyId(member.id);
      try {
        await assignBranchAccess(businessId, member.id, branchId, { confirm: true });
      } catch (retryErr) {
        setError(extractErrorMessage(retryErr));
        setBusyId(null);
        return;
      }
    }
    setPickerFor(null);
    await refresh();
    setBusyId(null);
  }

  const shownError = error || loadError;
  const nothingYet = !isLoading && members.length === 0 && invites.length === 0 && !shownError;

  // A business with two hundred branches has the staff to match, and
  // "who runs Vesu Point?" meant scrolling until a name was recognised.
  const filter = { query, branchId };
  const shownMembers = filterMembers(members, filter);
  const shownInvites = filterInvites(invites, filter);
  const total = members.length + invites.length;
  const shownTotal = shownMembers.length + shownInvites.length;
  const isFiltered = query.trim() !== '' || branchId !== null;
  // 200 cards is a long page however fast it renders; the rest arrive on asking.
  const visibleMembers = shownMembers.slice(0, Math.max(0, limit - shownInvites.length));
  const visibleInvites = shownInvites.slice(0, limit);
  const hidden = shownTotal - visibleInvites.length - visibleMembers.length;

  return (
    <div className={styles.page}>
      <PageHeader title={t('team.title')} backTo={pathTo('settings')} />

      {canOpenRoute(viewer, 'inviteMember') ? (
        <Enter delay={step(1)}>
          <InfoCard
            icon={IoPersonAddOutline}
            title={t('team.invite')}
            subtitle={t('team.inviteSubtitle')}
            to={pathTo('inviteMember')}
          />
        </Enter>
      ) : null}

      {shownError ? <ErrorBanner key={shownError} message={shownError} /> : null}

      {/* Requirement 18's audit sits above the list: it is the one thing here
          asking for a decision. Reported, never rewritten. */}
      {hasCashierConflicts(conflicts) ? (
        <Enter delay={step(1)}>
          <ConflictPanel conflicts={conflicts} />
        </Enter>
      ) : null}

      {total > 0 ? (
        <Enter delay={step(1)} className={styles.filters}>
          <SearchField label={t('team.search')} value={query} onChange={setQuery} />
          {tradingBranches.length > 1 ? (
            <Picker
              name="team-branch-filter"
              label={t('team.atBranch')}
              options={[
                { value: ALL, label: t('reports.allBranches') },
                ...tradingBranches.map((b) => ({
                  value: b.id,
                  label: b.name,
                  description: b.code,
                  keywords: [b.code, b.city, b.region],
                })),
              ]}
              value={branchId ?? ALL}
              onChange={(next) => setBranchId(next === ALL ? null : next)}
              flatAs="chips"
            />
          ) : null}
          {isFiltered ? (
            <p className={styles.count}>{t('team.showing', { shown: shownTotal, total })}</p>
          ) : null}
        </Enter>
      ) : null}

      {isLoading && members.length === 0 ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : nothingYet ? (
        <p className={styles.empty}>{t('team.empty')}</p>
      ) : shownTotal === 0 ? (
        <p className={styles.empty}>{t('team.noMatches')}</p>
      ) : (
        <ul className={styles.grid}>
          {visibleInvites.map((invite, index) => (
            <Enter as="li" key={invite.id} delay={step(Math.min(index + 2, 6))} className={cx(styles.card, styles.pending)}>
              <div className={styles.cardHead}>
                <p className={styles.name}>{invite.email}</p>
                <Pill label={t('team.pending')} tone="muted" />
              </div>
              <p className={styles.meta}>{t(`role.${invite.role}`)}</p>
              {canRevoke ? (
                <button
                  type="button"
                  className={styles.dangerAction}
                  disabled={busyId === invite.id}
                  onClick={() => onRevokeInvite(invite)}
                >
                  <IoCloseCircleOutline size={15} aria-hidden="true" />
                  <span>{busyId === invite.id ? t('common.loading') : t('team.revokeInvite')}</span>
                </button>
              ) : null}
            </Enter>
          ))}

          {visibleMembers.map((member, index) => {
            const revoked = member.status === 'REVOKED';
            const isYou = member.id === viewer?.id;
            const deleted = isDeletedAccount(member.user);
            const busy = busyId === member.id;
            return (
              <Enter
                as="li"
                key={member.id}
                delay={step(Math.min(invites.length + index + 2, 6))}
                className={cx(styles.card, revoked && styles.revoked)}
              >
                <div className={styles.cardHead}>
                  <p className={cx(styles.name, revoked && styles.nameRevoked)}>
                    {deleted ? t('team.deletedAccount') : (member.user.name ?? member.user.email)}
                    {isYou ? ` · ${t('team.you')}` : ''}
                  </p>
                  <Pill label={revoked ? t('team.revoked') : t(`role.${member.role}`)} tone={revoked ? 'muted' : 'brand'} />
                </div>
                {deleted ? null : <p className={styles.meta}>{member.user.email}</p>}

                {revoked ? (
                  <p className={styles.note}>{t('team.revokedNote')}</p>
                ) : reachesEveryBranch(member.role) ? (
                  <p className={styles.note}>{t('team.allBranches')}</p>
                ) : isSingleBranchRole(member.role) ? (
                  // Requirement 18: one branch that moves, not a set that grows —
                  // and holding none is said, not left looking like an empty list.
                  <>
                    {member.branchAccess.length === 0 ? (
                      <p className={styles.noteWarn}>{t('team.cashierNoBranch')}</p>
                    ) : (
                      <>
                        <div className={styles.branches}>
                          {member.branchAccess.map((access) => (
                            <Pill key={access.id} label={access.branch.name} tone="brand" />
                          ))}
                        </div>
                        <p className={styles.hint}>{t('team.cashierRule')}</p>
                      </>
                    )}
                    {!canManageBranches ? null : pickerFor === member.id ? (
                      <div className={styles.picker}>
                        <p className={styles.pickerTitle}>{t('team.pickBranch')}</p>
                        <CashierBranchPicker
                          name={`team-assign-${member.id}`}
                          branches={tradingBranches}
                          cashierByBranch={cashierByBranch}
                          selectedBranchId={member.branchAccess[0]?.branch.id ?? null}
                          forMembershipId={member.id}
                          onSelect={(branchId) => void onAssignBranch(member, branchId)}
                          disabled={busy}
                        />
                        <button type="button" className={styles.linkAction} onClick={() => setPickerFor(null)}>
                          <span>{t('common.cancel')}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.linkAction}
                        disabled={busy}
                        onClick={() => setPickerFor(member.id)}
                      >
                        <IoSwapHorizontalOutline size={15} aria-hidden="true" />
                        <span>
                          {busy
                            ? t('common.loading')
                            : member.branchAccess.length === 0
                              ? t('team.assignBranch')
                              : t('team.changeBranch')}
                        </span>
                      </button>
                    )}
                  </>
                ) : member.branchAccess.length === 0 ? (
                  <p className={styles.noteWarn}>{t('team.noBranches')}</p>
                ) : (
                  <>
                    <div className={styles.branches}>
                      {member.branchAccess.map((access) => (
                        <span key={access.id} className={styles.branchPill}>
                          <span>{access.branch.name}</span>
                          {canManageBranches ? (
                            <button
                              type="button"
                              className={styles.branchRemove}
                              disabled={busy}
                              onClick={() => onRemoveBranch(member, access.branch)}
                              aria-label={t('team.removeBranchAccessibility', { branch: access.branch.name })}
                              title={t('team.removeBranchAccessibility', { branch: access.branch.name })}
                            >
                              <IoCloseOutline size={14} aria-hidden="true" />
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>
                    {canManageBranches ? <p className={styles.hint}>{t('team.removeBranchHint')}</p> : null}
                  </>
                )}

                {canRevoke && canRemoveMember(viewer, member) ? (
                  <button
                    type="button"
                    className={styles.dangerAction}
                    disabled={busy}
                    onClick={() => onRemoveMember(member)}
                  >
                    <IoPersonRemoveOutline size={15} aria-hidden="true" />
                    <span>{busy ? t('common.loading') : t('team.removeMember')}</span>
                  </button>
                ) : null}
              </Enter>
            );
          })}
        </ul>
      )}

      {hidden > 0 ? (
        <button type="button" className={styles.showMore} onClick={() => setLimit((n) => n + PAGE)}>
          {t('team.showMore', { count: hidden })}
        </button>
      ) : null}
    </div>
  );
}
