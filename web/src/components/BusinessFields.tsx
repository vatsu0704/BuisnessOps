import { IoBriefcaseOutline, IoCashOutline, IoFlagOutline, IoTimeOutline } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import ChoiceTile from '@/components/ui/ChoiceTile';
import FormInput from '@/components/ui/FormInput';
import { INDUSTRY_OPTIONS } from '@/constants/industries';
import type { Industry } from '@/types/business';
import styles from './BusinessFields.module.css';

export type BusinessDraft = {
  name: string;
  industry: Industry;
  country: string;
  defaultCurrency: string;
  timezone: string;
};

/** What a business needs before it can be created — the rule both forms submit on. */
export function isBusinessDraftComplete(draft: BusinessDraft): boolean {
  return [draft.name, draft.country, draft.defaultCurrency, draft.timezone].every((v) => v.trim().length > 0);
}

type Props = {
  value: BusinessDraft;
  onChange: (next: BusinessDraft) => void;
  /** Each form words its fields in its own keys (`signup.*`, `addBusiness.*`). */
  labels: {
    name: string;
    namePlaceholder: string;
    industry: string;
    country: string;
    currency: string;
    timezone: string;
    timezoneHint?: string;
  };
};

/**
 * A business's details — name, industry, country, currency, timezone — as sign-up
 * and Add business both ask for them. The two are the same choice and must offer
 * the same options.
 */
export default function BusinessFields({ value, onChange, labels }: Props) {
  const { t } = useTranslation();
  const set = (patch: Partial<BusinessDraft>) => onChange({ ...value, ...patch });

  return (
    <>
      <FormInput
        label={labels.name}
        icon={IoBriefcaseOutline}
        placeholder={labels.namePlaceholder}
        autoComplete="organization"
        value={value.name}
        onChange={(e) => set({ name: e.target.value })}
      />

      <fieldset className={styles.choiceGrid}>
        <legend className={styles.fieldLabel}>{labels.industry}</legend>
        {INDUSTRY_OPTIONS.map((option) => (
          <ChoiceTile
            key={option.value}
            name="industry"
            value={option.value}
            title={t(`industry.${option.value}`)}
            caption={t(`industry.${option.value}_caption`)}
            icon={option.icon}
            selected={value.industry === option.value}
            onSelect={() => set({ industry: option.value })}
          />
        ))}
      </fieldset>

      <div className={styles.pair}>
        <FormInput
          label={labels.country}
          icon={IoFlagOutline}
          autoCapitalize="characters"
          autoComplete="country"
          value={value.country}
          onChange={(e) => set({ country: e.target.value.toUpperCase() })}
        />
        <FormInput
          label={labels.currency}
          icon={IoCashOutline}
          autoCapitalize="characters"
          value={value.defaultCurrency}
          onChange={(e) => set({ defaultCurrency: e.target.value.toUpperCase() })}
        />
      </div>

      <FormInput
        label={labels.timezone}
        hint={labels.timezoneHint}
        icon={IoTimeOutline}
        value={value.timezone}
        onChange={(e) => set({ timezone: e.target.value })}
      />
    </>
  );
}
