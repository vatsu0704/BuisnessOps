import { IoBriefcaseOutline, IoCashOutline, IoFlagOutline, IoTimeOutline } from 'react-icons/io5';
import { useTranslation } from 'react-i18next';
import ChoiceTile from '@/components/ui/ChoiceTile';
import FormInput from '@/components/ui/FormInput';
import Picker from '@/components/ui/Picker';
import { INDUSTRY_OPTIONS } from '@/constants/industries';
import { COUNTRIES, CURRENCIES, TIMEZONES } from '@shared/constants/regions';
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

      {/* Typed by hand until 2026-10-19. A timezone the tzdb does not know is
          resolved to UTC by the server without a word, which files a shop's
          evening sales on the day before. */}
      <div className={styles.pair}>
        <Picker
          name="country"
          label={labels.country}
          icon={IoFlagOutline}
          value={value.country}
          onChange={(country) => set({ country })}
          options={COUNTRIES.map((country) => ({
            value: country.code,
            label: country.name,
            description: country.code,
            keywords: [country.code, ...(country.aliases ?? [])],
          }))}
        />
        <Picker
          name="defaultCurrency"
          label={labels.currency}
          icon={IoCashOutline}
          value={value.defaultCurrency}
          onChange={(defaultCurrency) => set({ defaultCurrency })}
          options={CURRENCIES.map((currency) => ({
            value: currency.code,
            label: currency.code,
            description: currency.name,
            keywords: [currency.name, currency.symbol],
          }))}
        />
      </div>

      <Picker
        name="timezone"
        label={labels.timezone}
        icon={IoTimeOutline}
        value={value.timezone}
        onChange={(timezone) => set({ timezone })}
        options={TIMEZONES.map((zone) => ({
          value: zone.id,
          label: zone.id,
          description: zone.places.slice(0, 2).join(' · '),
          keywords: zone.places,
        }))}
      />
      {labels.timezoneHint ? <p className={styles.fieldHint}>{labels.timezoneHint}</p> : null}
    </>
  );
}
