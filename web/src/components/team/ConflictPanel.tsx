import { useTranslation } from 'react-i18next';
import { IoAlertCircleOutline } from 'react-icons/io5';
import type { CashierConflicts } from '@/types/team';
import styles from './ConflictPanel.module.css';

/**
 * Requirement 18's audit, rendered — the app's Team `ConflictPanel`.
 *
 * Deliberately not actionable from here. Every line is a fact and the fix is the
 * "change branch" action on the row it names, because settling a shared branch
 * means deciding who keeps it — and a one-click "fix" button would have to guess.
 */
export default function ConflictPanel({ conflicts }: { conflicts: CashierConflicts }) {
  const { t } = useTranslation();
  return (
    <section className={styles.panel} aria-labelledby="team-conflicts-title">
      <h2 id="team-conflicts-title" className={styles.title}>
        <IoAlertCircleOutline size={17} aria-hidden="true" />
        <span>{t('team.conflictsTitle')}</span>
      </h2>
      <p className={styles.body}>{t('team.conflictsBody')}</p>
      <ul className={styles.lines}>
        {conflicts.sharedBranches.map((entry) => (
          <li key={entry.branch.id}>
            {t('team.conflictSharedBranch', {
              branch: entry.branch.name,
              count: entry.cashiers.length,
              names: entry.cashiers.map((c) => c.name ?? c.email).join(', '),
            })}
          </li>
        ))}
        {conflicts.misassignedCashiers.map((entry) => (
          <li key={entry.membershipId}>
            {entry.branchCount === 0
              ? t('team.conflictNoBranch', { name: entry.name ?? entry.email })
              : t('team.conflictTooManyBranches', { name: entry.name ?? entry.email, count: entry.branchCount })}
          </li>
        ))}
      </ul>
    </section>
  );
}
