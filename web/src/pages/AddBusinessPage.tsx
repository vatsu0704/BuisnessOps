import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoArrowForward } from 'react-icons/io5';
import BusinessFields, { isBusinessDraftComplete, type BusinessDraft } from '@/components/BusinessFields';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import { browserTimeZone } from '@/utils/timezone';
import styles from './FormPage.module.css';

/**
 * Requirement 16 — another business under the same account, the app's Add
 * business screen. It starts from the current business's industry, country,
 * currency and timezone, since a second business is usually a sibling of the
 * first, and switches to the new one once it exists.
 */
export default function AddBusinessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const addBusiness = useAuthStore((s) => s.addBusiness);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const current = useAuthStore((s) => s.business);

  const [draft, setDraft] = useState<BusinessDraft>(() => ({
    name: '',
    industry: current?.industry ?? 'RETAIL',
    country: current?.country ?? 'IN',
    defaultCurrency: current?.defaultCurrency ?? 'INR',
    timezone: current?.timezone ?? browserTimeZone(),
  }));
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isBusinessDraftComplete(draft) && !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      await addBusiness({
        name: draft.name.trim(),
        industry: draft.industry,
        country: draft.country.trim(),
        defaultCurrency: draft.defaultCurrency.trim(),
        timezone: draft.timezone.trim(),
      });
      navigate(pathTo('settings'));
    } catch {
      setError(useAuthStore.getState().error);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader title={t('addBusiness.title')} subtitle={t('addBusiness.subtitle')} backTo={pathTo('settings')} />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      <Enter delay={step(1)}>
        <Card>
          <BusinessFields
            value={draft}
            onChange={(next) => {
              setDraft(next);
              if (error) setError(null);
            }}
            labels={{
              name: t('addBusiness.name'),
              namePlaceholder: t('addBusiness.namePlaceholder'),
              industry: t('addBusiness.industry'),
              country: t('addBusiness.country'),
              currency: t('addBusiness.currency'),
              timezone: t('addBusiness.timezone'),
              timezoneHint: t('addBusiness.timezoneHint'),
            }}
          />
        </Card>
      </Enter>

      <Enter delay={step(2)} className={styles.submit}>
        <PrimaryButton
          type="submit"
          block
          title={isSubmitting ? t('addBusiness.submitting') : t('addBusiness.submit')}
          icon={IoArrowForward}
          loading={isSubmitting}
          disabled={!canSubmit}
        />
        <p className={styles.footnote}>{t('addBusiness.switchNote')}</p>
      </Enter>
    </form>
  );
}
