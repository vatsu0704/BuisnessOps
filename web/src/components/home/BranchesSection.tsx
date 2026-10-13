import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoAdd, IoChevronForward, IoLocation } from 'react-icons/io5';
import { useBranches } from '@/hooks/useBranches';
import { pathTo } from '@/routes/paths';
import { cx } from '@/utils/cx';
import styles from './BranchesSection.module.css';

const PREVIEW_COUNT = 5;

/**
 * The branch list. Gated on `branch:update`, because its only interaction is
 * opening a branch's settings — a list whose every row leads somewhere the
 * viewer cannot go is worse than no list.
 */
export default function BranchesSection() {
  const { t } = useTranslation();
  const { branches, stats } = useBranches();

  if (stats.total === 0) return null;

  return (
    <section className={styles.card} aria-labelledby="home-branches-title">
      <div className={styles.head}>
        <h2 id="home-branches-title" className={styles.title}>
          {t('home.branchesTitle')}
        </h2>
        <Link to={pathTo('addBranch')} className={styles.add}>
          <IoAdd size={16} aria-hidden="true" />
          <span>{t('home.addBranch')}</span>
        </Link>
      </div>

      <ul className={styles.list}>
        {branches.slice(0, PREVIEW_COUNT).map((branch) => (
          <li key={branch.id}>
            <Link to={pathTo('branchSettings', { branchId: branch.id })} className={styles.row}>
              <span
                className={cx(styles.dot, branch.status === 'ACTIVE' && styles.dotActive)}
                aria-hidden="true"
              />
              <span className={styles.text}>
                <span className={styles.name}>{branch.name}</span>
                {/* A warehouse says what it is; a branch says who pays for its
                    raw material, since that changes how every order is handled. */}
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
              {/* A branch with a punch-in radius says so; one without enforces none. */}
              {branch.geofenceRadiusMeters !== null ? (
                <IoLocation size={14} className={styles.geofence} aria-hidden="true" />
              ) : null}
              <IoChevronForward size={16} className={styles.chevron} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {branches.length > PREVIEW_COUNT ? (
        <p className={styles.more}>{t('common.more', { count: branches.length - PREVIEW_COUNT })}</p>
      ) : null}
    </section>
  );
}
