import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoCheckmark, IoCheckmarkCircle, IoMailOutline } from 'react-icons/io5';
import { PLAN_ITEMS, subscriptionStateLine, subscriptionStatusLabel } from '@shared/constants/plans';
import { planName } from '@shared/permissions/explain';
import { getSubscription } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Pill, { type PillTone } from '@/components/ui/Pill';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { SubscriptionSummary } from '@/types/user';
import { cx } from '@/utils/cx';
import styles from './PlanPage.module.css';

/**
 * Requirement 28 — the owner's view of the plan: where it stands, the trading
 * branches in use against the ones paid for, and what every plan includes.
 *
 * The same content as the app's Plan screen, built from the same shared summary
 * (`constants/plans.ts`), plus one thing the app deliberately leaves out: who to
 * write to about changing the plan. A plan is changed by hand after a UPI or
 * bank payment until a payment gateway exists, and Google Play's payments policy
 * governs what an Android app may say about paying outside Play — a web page is
 * not under it. Still no prices: they are a commercial decision recorded in
 * Docs/REQUIREMENTS.md R28, not something the page states.
 */

function statusTone(summary: SubscriptionSummary): PillTone {
  if (summary.state === 'READ_ONLY') return 'danger';
  if (summary.state === 'GRACE') return 'warning';
  return summary.status === 'ACTIVE' ? 'success' : 'brand';
}

export default function PlanPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    try {
      setSummary(await getSubscription(businessId));
      setError(null);
    } catch (err) {
      // A failed refresh keeps what was showing and says why beside it.
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useRefreshOnFocus(load);

  return (
    <div className={styles.page}>
      <PageHeader title={t('plans.title')} subtitle={t('plans.subtitle')} backTo={pathTo('settings')} />

      {error ? <ErrorBanner message={error} /> : null}

      {!summary ? (
        isLoading ? (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        ) : null
      ) : (
        <>
          {/* The plan and its branches side by side once there is room, stacked
              before: each card's sentence is long in Gujarati. */}
          <div className={styles.top}>
            <Enter delay={step(1)}>
              <Card title={t('plans.currentPlan')}>
                <p className={styles.planName} data-testid="plan-current-name">
                  {planName(summary.plan)}
                </p>
                <div className={styles.pills}>
                  <Pill label={subscriptionStatusLabel(summary, t)} tone={statusTone(summary)} />
                  {summary.interval ? <Pill label={t(`plans.interval.${summary.interval}`)} tone="muted" /> : null}
                </div>
                <p className={styles.stateLine}>{subscriptionStateLine(summary, t)}</p>
              </Card>
            </Enter>

            <Enter delay={step(2)}>
              <Card title={t('plans.branchesTitle')}>
                <p className={styles.branchesLine}>
                  {summary.paidBranchCount === null
                    ? t('plans.branchesTrial', { used: summary.billedBranchCount })
                    : t('plans.branchesUsed', { used: summary.billedBranchCount, paid: summary.paidBranchCount })}
                </p>
                <p className={styles.note}>{t('plans.branchesNote')}</p>
              </Card>
            </Enter>
          </div>

          <Enter delay={step(3)}>
            <p className={styles.contact}>
              <IoMailOutline aria-hidden="true" />
              <span>
                {summary.contactEmail ? (
                  <>
                    {t('web.plan.contact')}{' '}
                    <a href={`mailto:${summary.contactEmail}`}>{summary.contactEmail}</a>
                  </>
                ) : (
                  t('web.plan.contactUnset')
                )}
              </span>
            </p>
          </Enter>

          <section className={styles.compare} aria-labelledby="plan-compare">
            <h2 id="plan-compare" className={styles.sectionTitle}>
              {t('plans.compareTitle')}
            </h2>
            {/* A grid that becomes columns only when each column can hold a
                Gujarati line; a single column before that. */}
            <ul className={styles.plans}>
              {summary.plans.map((plan, index) => {
                const isCurrent = plan.code === summary.plan;
                return (
                  <Enter as="li" key={plan.code} delay={step(4 + index)}>
                    <div className={cx(styles.planCard, isCurrent && styles.planCardCurrent)}>
                      <div className={styles.planHeader}>
                        <h3 className={styles.planTitle}>{planName(plan.code)}</h3>
                        {isCurrent ? <Pill label={t('plans.current')} tone="brand" icon={IoCheckmark} /> : null}
                      </div>
                      <p className={styles.lead}>{t(`plans.lead.${plan.code}`)}</p>
                      <ul className={styles.items}>
                        {PLAN_ITEMS[plan.code].map((item) => (
                          <li key={item} className={styles.item}>
                            <IoCheckmarkCircle className={styles.itemIcon} aria-hidden="true" />
                            <span>{t(`plans.item.${item}`)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Enter>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
