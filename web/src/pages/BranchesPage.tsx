import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IoAddOutline, IoChevronForward, IoLocationSharp } from 'react-icons/io5';
import Enter from '@/components/ui/Enter';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/SearchField';
import { useBranches } from '@/hooks/useBranches';
import { useMembership } from '@/hooks/useBusinessId';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import { hasCapability } from '@/utils/permissions';
import { SEARCH_FROM, filterByQuery, isSearchable } from '@shared/utils/optionSearch';
import styles from './BranchesPage.module.css';

/**
 * Every branch and warehouse, on the way to one's settings — the app's Branches
 * screen.
 *
 * Home previews five and used to end with a plain "+N more" that led nowhere, so
 * a business with two hundred branches could open the settings of exactly five
 * of them. This is where that text now goes.
 *
 * A list with a filter rather than a `Picker`: this is navigation, not a choice.
 * It borrows the same matcher, so typing "sg" finds the same branch here as it
 * does in every chooser.
 */
export default function BranchesPage() {
  const { t } = useTranslation();
  const membership = useMembership();
  const { branches } = useBranches();
  const [query, setQuery] = useState('');

  const shown = useMemo(
    () =>
      filterByQuery(branches, query, (branch) => ({
        primary: branch.name,
        secondary: [branch.code, branch.city, branch.region],
      })),
    [branches, query]
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('branches.title')}
        subtitle={t('branches.subtitle', { count: branches.length })}
        actions={
          hasCapability(membership, 'branch:create') ? (
            <Link to={pathTo('addBranch')} className={styles.add}>
              <IoAddOutline size={16} aria-hidden="true" />
              <span>{t('home.addBranch')}</span>
            </Link>
          ) : undefined
        }
      />

      {/* Only once scanning has stopped working — the same threshold every
          chooser uses. */}
      {isSearchable(branches.length, SEARCH_FROM) ? (
        <Enter delay={step(1)}>
          <SearchField label={t('branches.search')} value={query} onChange={setQuery} />
        </Enter>
      ) : null}

      <Enter delay={step(2)}>
        {shown.length === 0 ? (
          <p className={styles.empty}>
            {branches.length === 0 ? t('branches.none') : t('web.picker.noMatches', { query })}
          </p>
        ) : (
          <ul className={styles.list}>
            {shown.map((branch) => (
              <li key={branch.id}>
                <Link to={pathTo('branchSettings', { branchId: branch.id })} className={styles.row}>
                  <span
                    className={cx(styles.dot, branch.status !== 'ACTIVE' && styles.dotInactive)}
                    aria-hidden="true"
                  />
                  <span className={styles.text}>
                    <span className={styles.name}>{branch.name}</span>
                    {/* A warehouse says what it is; a branch says who pays for
                        its raw material (requirement 24), since that changes how
                        every order from it is handled. */}
                    <span className={styles.meta}>
                      {[
                        branch.kind === 'WAREHOUSE'
                          ? t('addBranch.kindWarehouse')
                          : branch.operatingModel === 'FOCO'
                            ? t('addBranch.modelFoco')
                            : t('addBranch.modelFm'),
                        branch.code,
                        branch.city,
                        branch.region,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {/* Says out loud that a branch with no radius set enforces
                      none, which is otherwise invisible until somebody punches
                      in from the wrong place. */}
                  {branch.geofenceRadiusMeters !== null ? (
                    <IoLocationSharp size={14} className={styles.pin} aria-hidden="true" />
                  ) : null}
                  <IoChevronForward size={16} className={styles.chevron} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Enter>
    </div>
  );
}
