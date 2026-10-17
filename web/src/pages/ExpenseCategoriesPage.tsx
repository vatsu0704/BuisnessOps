import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoCafeOutline, IoLockClosedOutline, IoTrendingUpOutline } from 'react-icons/io5';
import { categoryLabel } from '@shared/utils/expenseCategory';
import { extractErrorMessage } from '@/api/client';
import { listExpenseCategories, setExpenseCategoryCostType } from '@/api/expenses';
import Card from '@/components/ui/Card';
import ChipGroup from '@/components/ui/ChipGroup';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { canOpenRoute, pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { ExpenseCategory, ExpenseCostType } from '@/types/expense';
import { hasCapability } from '@/utils/permissions';
import styles from './ExpenseCategoriesPage.module.css';

const TYPES: { type: ExpenseCostType; icon: IconType }[] = [
  { type: 'VARIABLE', icon: IoTrendingUpOutline },
  { type: 'FIXED', icon: IoLockClosedOutline },
  { type: 'DAILY', icon: IoCafeOutline },
];

/**
 * How costs are grouped in Reports — requirement 34, the app's Kinds of cost.
 *
 * Every expense category is variable, fixed or day-to-day, and Reports adds the
 * spending up that way. Two lines that are not categories are stated so the
 * reader is not left wondering: raw material is always variable, wages always
 * fixed.
 *
 * Reading it is `expense:view`; changing a category is `expense:classify` — the
 * cashier who logs the milk does not decide how the owner's report sorts it.
 * Changing one moves only the split; no total changes.
 */
export default function ExpenseCategoriesPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const canClassify = hasCapability(membership, 'expense:classify');

  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      setCategories(await listExpenseCategories(businessId));
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId]);
  useRefreshOnFocus(load);

  async function choose(category: ExpenseCategory, costType: ExpenseCostType) {
    if (!businessId || category.costType === costType || saving === category.id) return;
    setSaving(category.id);
    setError(null);
    // Shown at once and put back if the server refuses, so a row never sits on a
    // choice nobody made.
    setCategories((rows) => rows?.map((row) => (row.id === category.id ? { ...row, costType } : row)) ?? rows);
    try {
      await setExpenseCategoryCostType(businessId, category.id, costType);
    } catch (err) {
      setCategories((rows) => rows?.map((row) => (row.id === category.id ? category : row)) ?? rows);
      setError(extractErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  // Reached from Reports and from Settings: back goes to Reports when it opens.
  const backTo = canOpenRoute(membership, 'reports') ? pathTo('reports') : pathTo('settings');

  return (
    <div className={styles.page}>
      <PageHeader title={t('costTypes.title')} subtitle={t('costTypes.subtitle')} backTo={backTo} />

      <div className={styles.layout}>
        <div className={styles.column}>
          <Enter delay={step(1)}>
            <Card>
              <ul className={styles.explainer}>
                {TYPES.map(({ type, icon: Icon }) => (
                  <li key={type} className={styles.explainRow}>
                    <Icon size={17} className={styles.explainIcon} aria-hidden="true" />
                    <p>
                      <strong>{t(`costTypes.type.${type}`)}</strong>
                      {' — '}
                      {t(`costTypes.hint.${type}`)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </Enter>

          <Enter delay={step(2)}>
            <Card title={t('costTypes.alwaysSection')}>
              <dl className={styles.always}>
                <div className={styles.alwaysRow}>
                  <dt>{t('costTypes.rawMaterial')}</dt>
                  <dd>{t('costTypes.type.VARIABLE')}</dd>
                </div>
                <div className={styles.alwaysRow}>
                  <dt>{t('costTypes.wages')}</dt>
                  <dd>{t('costTypes.type.FIXED')}</dd>
                </div>
              </dl>
            </Card>
          </Enter>
        </div>

        <Enter delay={step(3)}>
          <Card title={t('costTypes.categoriesSection')}>
            {!canClassify ? <p className={styles.readOnly}>{t('costTypes.readOnly')}</p> : null}
            {error ? <ErrorBanner message={error} className={styles.error} /> : null}
            {categories === null && !error ? (
              <div className={styles.loading}>
                <Spinner size={22} />
              </div>
            ) : null}
            <ul className={styles.list}>
              {(categories ?? []).map((category) => (
                // The name above its choice, never beside it: three chips already
                // fill a row, and a long name beside them breaks in Gujarati.
                <li key={category.id} className={styles.row}>
                  <p className={styles.rowName}>{categoryLabel(category, t)}</p>
                  {canClassify ? (
                    <ChipGroup<ExpenseCostType>
                      name={`cost-type-${category.id}`}
                      label={categoryLabel(category, t)}
                      hideLabel
                      options={TYPES.map(({ type, icon }) => ({
                        value: type,
                        label: t(`costTypes.type.${type}`),
                        icon,
                      }))}
                      value={category.costType}
                      onChange={(type) => void choose(category, type)}
                      disabled={saving === category.id}
                    />
                  ) : (
                    <p className={styles.rowType}>{t(`costTypes.type.${category.costType}`)}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </Enter>
      </div>
    </div>
  );
}
