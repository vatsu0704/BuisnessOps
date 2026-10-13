import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IoArrowForward,
  IoCashOutline,
  IoLocationOutline,
  IoMailOutline,
  IoMapOutline,
  IoNavigateCircleOutline,
  IoPricetagOutline,
  IoStorefrontOutline,
  IoTimeOutline,
} from 'react-icons/io5';
import { createBranch } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import BranchKindFields from '@/components/branches/BranchKindFields';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import GeofenceFields from '@/components/branches/GeofenceFields';
import { checkGeofence, EMPTY_GEOFENCE, type GeofenceDraft } from '@/components/branches/geofence';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import FormTextArea from '@/components/ui/FormTextArea';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { hasPlanFeature } from '@/utils/permissions';
import { useGoBack } from '@/hooks/useGoBack';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { refreshBranches } from '@/store/branchStore';
import { step } from '@/theme/motion';
import type { BranchKind, BranchOperatingModel } from '@/types/branch';
import { browserTimeZone } from '@/utils/timezone';
import styles from './FormPage.module.css';

type Details = {
  name: string;
  code: string;
  city: string;
  region: string;
  addressLine: string;
  postalCode: string;
  currency: string;
  timezone: string;
};

/**
 * A new branch or warehouse — the app's Add branch screen. Its timezone and
 * currency start from the business's, and the geofence is optional: a branch
 * with no coordinates enforces no punch-in radius, and Branch settings can add
 * one later.
 */
export default function AddBranchPage() {
  const { t } = useTranslation();
  const business = useAuthStore((s) => s.business);
  const businessId = useBusinessId();
  const goBack = useGoBack(pathTo('home'));

  const [kind, setKind] = useState<BranchKind>('BRANCH');
  // Nothing is preselected: it decides whether a cashier is ever asked to pay,
  // which is not a thing to default quietly — unless the plan leaves only one
  // answer (requirement 28: company-operated is Franchise).
  const canFoco = hasPlanFeature(useMembership(), 'focoBranches');
  const [operatingModel, setOperatingModel] = useState<BranchOperatingModel | null>(() =>
    canFoco ? null : 'FM'
  );
  const [details, setDetails] = useState<Details>(() => ({
    name: '',
    code: '',
    city: '',
    region: '',
    addressLine: '',
    postalCode: '',
    currency: business?.defaultCurrency ?? 'INR',
    timezone: business?.timezone ?? browserTimeZone(),
  }));
  const [geofence, setGeofence] = useState<GeofenceDraft>(EMPTY_GEOFENCE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Details>) => setDetails((d) => ({ ...d, ...patch }));
  const check = checkGeofence(geofence);

  const canSubmit =
    !!businessId &&
    (kind === 'WAREHOUSE' || operatingModel !== null) &&
    details.name.trim() !== '' &&
    details.code.trim() !== '' &&
    details.timezone.trim() !== '' &&
    check.ok &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createBranch(businessId, {
        name: details.name.trim(),
        code: details.code.trim().toUpperCase(),
        kind,
        operatingModel: kind === 'BRANCH' && operatingModel ? operatingModel : undefined,
        timezone: details.timezone.trim(),
        city: details.city.trim() || undefined,
        region: details.region.trim() || undefined,
        addressLine: details.addressLine.trim() || undefined,
        postalCode: details.postalCode.trim() || undefined,
        country: business?.country,
        currency: details.currency.trim() || undefined,
        latitude: check.hasCoordinates ? Number(geofence.latitude) : undefined,
        longitude: check.hasCoordinates ? Number(geofence.longitude) : undefined,
        geofenceRadiusMeters: check.radius ?? undefined,
      });
      // Before leaving: Home, Settings and every branch picker read this one list.
      await refreshBranches();
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader title={t('addBranch.title')} subtitle={t('addBranch.subtitle')} backTo={pathTo('home')} />

      <Enter delay={step(1)}>
        <Card>
          <BranchKindFields
            kind={kind}
            operatingModel={operatingModel}
            onKindChange={setKind}
            onModelChange={setOperatingModel}
            modelHint={t('addBranch.modelHint')}
            withCaptions
            offerFoco={canFoco}
            planIncludesFoco={canFoco}
          />
        </Card>
      </Enter>

      <Enter delay={step(2)}>
        <Card>
          <FormInput
            label={t('addBranch.name')}
            icon={IoStorefrontOutline}
            placeholder={t('addBranch.namePlaceholder')}
            autoComplete="off"
            value={details.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <FormInput
            label={t('addBranch.code')}
            hint={t('addBranch.codeHint')}
            icon={IoPricetagOutline}
            placeholder={t('addBranch.codePlaceholder')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={details.code}
            onChange={(e) => set({ code: e.target.value })}
          />
          <div className={fieldStyles.pair}>
            <FormInput
              label={t('addBranch.city')}
              icon={IoLocationOutline}
              autoComplete="address-level2"
              value={details.city}
              onChange={(e) => set({ city: e.target.value })}
            />
            <FormInput
              label={t('addBranch.region')}
              icon={IoMapOutline}
              autoComplete="address-level1"
              value={details.region}
              onChange={(e) => set({ region: e.target.value })}
            />
          </div>
          {/* What a delivery agent reads to find the place; the landmark is
              usually the half that does it. */}
          <FormTextArea
            label={t('branchSettings.address')}
            hint={t('addStaff.optional')}
            icon={IoNavigateCircleOutline}
            placeholder={t('branchSettings.addressPlaceholder')}
            autoComplete="street-address"
            value={details.addressLine}
            onChange={(e) => set({ addressLine: e.target.value })}
          />
          <div className={fieldStyles.pair}>
            <FormInput
              label={t('branchSettings.postalCode')}
              icon={IoMailOutline}
              inputMode="numeric"
              autoComplete="postal-code"
              value={details.postalCode}
              onChange={(e) => set({ postalCode: e.target.value })}
            />
            <FormInput
              label={t('addBranch.currency')}
              icon={IoCashOutline}
              autoCapitalize="characters"
              autoComplete="off"
              value={details.currency}
              onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
            />
          </div>
          <FormInput
            label={t('addBranch.timezone')}
            icon={IoTimeOutline}
            autoComplete="off"
            spellCheck={false}
            value={details.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            className={fieldStyles.last}
          />
        </Card>
      </Enter>

      <Enter delay={step(3)}>
        <GeofenceFields value={geofence} onChange={setGeofence} hint={t('addBranch.geofenceHint')} />
      </Enter>

      <Enter delay={step(4)} className={styles.submit}>
        {/* Beside the button, not at the top: a long form's top is off screen when it is pressed. */}
        {error ? <ErrorBanner key={error} message={error} /> : null}
        <PrimaryButton
          type="submit"
          block
          title={isSubmitting ? t('addBranch.submitting') : t('addBranch.submit')}
          icon={IoArrowForward}
          loading={isSubmitting}
          disabled={!canSubmit}
        />
      </Enter>
    </form>
  );
}
