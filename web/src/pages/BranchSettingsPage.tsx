import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoMailOutline, IoNavigateCircleOutline, IoRefresh, IoStorefrontOutline, IoTimeOutline } from 'react-icons/io5';
import { updateBranch, type UpdateBranchPayload } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import BranchKindFields from '@/components/branches/BranchKindFields';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import GeofenceFields from '@/components/branches/GeofenceFields';
import { checkGeofence, geofenceFromBranch, type GeofenceDraft } from '@/components/branches/geofence';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import FormTextArea from '@/components/ui/FormTextArea';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { pathTo } from '@/routes/paths';
import { refreshBranches, useBranchStore } from '@/store/branchStore';
import { step } from '@/theme/motion';
import type { Branch, BranchKind, BranchOperatingModel } from '@/types/branch';
import NoticePage from './NoticePage';
import styles from './FormPage.module.css';

type Draft = {
  kind: BranchKind;
  operatingModel: BranchOperatingModel;
  timezone: string;
  addressLine: string;
  postalCode: string;
  geofence: GeofenceDraft;
};

function draftFrom(branch: Branch): Draft {
  return {
    kind: branch.kind,
    operatingModel: branch.operatingModel,
    timezone: branch.timezone,
    addressLine: branch.addressLine ?? '',
    postalCode: branch.postalCode ?? '',
    geofence: geofenceFromBranch(branch),
  };
}

type Load = { state: 'loading' } | { state: 'ready'; branch: Branch } | { state: 'missing' } | { state: 'failed'; message: string };

/**
 * One branch's kind, payment model, timezone, delivery address and punch-in
 * geofence — the app's Branch settings screen.
 *
 * The timezone matters beyond attendance: it decides which calendar day a punch
 * near midnight belongs to, and so which month it is paid in.
 */
export default function BranchSettingsPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { branchId } = useParams<'branchId'>();
  const goBack = useGoBack(pathTo('home'));

  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The form starts from the server's copy, not from a list fetched an hour ago,
  // and fetching through the store freshens Home's list on the way.
  const fetchBranch = useCallback(async () => {
    if (!businessId || !branchId) return;
    setLoad({ state: 'loading' });
    await useBranchStore.getState().fetchNow(businessId);
    const store = useBranchStore.getState();
    const found = store.loadedFor === businessId ? store.branches.find((b) => b.id === branchId) : undefined;
    if (found) {
      setDraft(draftFrom(found));
      setLoad({ state: 'ready', branch: found });
    } else if (store.error) {
      setLoad({ state: 'failed', message: store.error });
    } else {
      setLoad({ state: 'missing' });
    }
  }, [businessId, branchId]);

  useEffect(() => {
    void fetchBranch();
  }, [fetchBranch]);

  if (load.state === 'missing') {
    return <NoticePage icon={IoStorefrontOutline} title={t('branchSettings.title')} body={t('branchSettings.notFound')} />;
  }

  if (load.state === 'loading' || load.state === 'failed' || !draft) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('branchSettings.title')} backTo={pathTo('home')} />
        {load.state === 'failed' ? (
          <>
            <ErrorBanner message={load.message} />
            <div>
              <Button title={t('common.retry')} icon={IoRefresh} onClick={() => void fetchBranch()} />
            </div>
          </>
        ) : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )}
      </div>
    );
  }

  const { branch } = load;
  const check = checkGeofence(draft.geofence);
  const canSave = !!businessId && draft.timezone.trim() !== '' && check.ok && !isSaving;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!canSave || !businessId || !draft) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload: UpdateBranchPayload = {
        kind: draft.kind,
        // Only a branch is asked, so only a branch sends it.
        ...(draft.kind === 'BRANCH' ? { operatingModel: draft.operatingModel } : {}),
        timezone: draft.timezone.trim(),
        // Emptied means cleared: an address somebody deleted has to actually go.
        addressLine: draft.addressLine.trim() || null,
        postalCode: draft.postalCode.trim() || null,
        // null clears — that is how "forget this location" and "turn off geofencing" are said.
        latitude: check.hasCoordinates ? Number(draft.geofence.latitude) : null,
        longitude: check.hasCoordinates ? Number(draft.geofence.longitude) : null,
        geofenceRadiusMeters: check.radius,
      };
      await updateBranch(businessId, branch.id, payload);
      await refreshBranches();
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSave} noValidate>
      <PageHeader title={branch.name} subtitle={t('branchSettings.title')} backTo={pathTo('home')} />

      {/* Changeable, not write-once: a location created as the wrong kind would
          otherwise be stuck as one. Each order keeps the payment model it was
          placed under, so a change here decides only the next one. */}
      <Enter delay={step(1)}>
        <Card>
          <BranchKindFields
            kind={draft.kind}
            operatingModel={draft.operatingModel}
            onKindChange={(kind) => set({ kind })}
            onModelChange={(operatingModel) => set({ operatingModel })}
            kindHint={t('branchSettings.kindHint')}
            modelHint={t('branchSettings.modelHint')}
          />
        </Card>
      </Enter>

      {/* The app gives each of these a card with a heading that repeats its one
          field's label; here the field is the heading and the sentence sits under it. */}
      <Enter delay={step(2)}>
        <Card>
          <FormInput
            label={t('branchSettings.timezone')}
            description={t('branchSettings.timezoneHint')}
            icon={IoTimeOutline}
            autoComplete="off"
            spellCheck={false}
            value={draft.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
          />
          {/* What a rider reads to find the branch, beside the point the
              geofence checks: both answer "where is it". */}
          <FormTextArea
            label={t('branchSettings.address')}
            description={t('branchSettings.addressHint')}
            icon={IoNavigateCircleOutline}
            placeholder={t('branchSettings.addressPlaceholder')}
            autoComplete="street-address"
            value={draft.addressLine}
            onChange={(e) => set({ addressLine: e.target.value })}
          />
          <FormInput
            label={t('branchSettings.postalCode')}
            icon={IoMailOutline}
            inputMode="numeric"
            autoComplete="postal-code"
            value={draft.postalCode}
            onChange={(e) => set({ postalCode: e.target.value })}
            className={fieldStyles.last}
          />
        </Card>
      </Enter>

      <Enter delay={step(3)}>
        <GeofenceFields
          value={draft.geofence}
          onChange={(geofence) => set({ geofence })}
          hint={t('branchSettings.geofenceHint')}
          canClear
        />
      </Enter>

      <Enter delay={step(4)} className={styles.submit}>
        {error ? <ErrorBanner key={error} message={error} /> : null}
        <PrimaryButton
          type="submit"
          block
          title={isSaving ? t('branchSettings.saving') : t('branchSettings.save')}
          loading={isSaving}
          disabled={!canSave}
        />
      </Enter>
    </form>
  );
}
