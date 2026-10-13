import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IoCloseCircleOutline,
  IoLocateOutline,
  IoMapOutline,
  IoNavigateOutline,
  IoResizeOutline,
} from 'react-icons/io5';
import Card from '@/components/ui/Card';
import FormInput from '@/components/ui/FormInput';
import Spinner from '@/components/ui/Spinner';
import { getCurrentCoords, mapLink } from '@/utils/location';
import { cx } from '@/utils/cx';
import { checkGeofence, draftPoint, type GeofenceDraft } from './geofence';
import styles from './BranchFields.module.css';

type Props = {
  value: GeofenceDraft;
  onChange: (next: GeofenceDraft) => void;
  /** Add branch says this is optional; Branch settings says what an empty radius means. */
  hint: string;
  /** Branch settings can switch a geofence off; a branch being created has none yet. */
  canClear?: boolean;
};

/**
 * Where a branch is, and how close staff must be to punch in — the same card on
 * both branch forms.
 *
 * "Use my current location" asks the browser, which on a laptop is usually a
 * Wi-Fi fix good to tens of metres. That is why the map link is here and not in
 * the app: it lets the person check the point before a radius is measured from it.
 */
export default function GeofenceFields({ value, onChange, hint, canClear }: Props) {
  const { t } = useTranslation();
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const check = checkGeofence(value);
  const point = draftPoint(value);
  const set = (patch: Partial<GeofenceDraft>) => onChange({ ...value, ...patch });

  async function useCurrentLocation() {
    setIsLocating(true);
    setLocationError(null);
    const result = await getCurrentCoords();
    setIsLocating(false);
    if ('failure' in result) {
      // The person asked for this, so silence would read as a broken button.
      setLocationError(result.failure === 'denied' ? t('web.location.denied') : t('branchSettings.locationUnavailable'));
      return;
    }
    // Six decimal places is what the column stores (Decimal(9,6)) — about 0.1m.
    set({ latitude: result.coords.latitude.toFixed(6), longitude: result.coords.longitude.toFixed(6) });
  }

  const radiusError = check.radiusNeedsCoordinates
    ? t('branchSettings.radiusNeedsLocation')
    : !check.radiusIsValid
      ? t('errors.validation.GEOFENCE_RADIUS_POSITIVE')
      : null;

  return (
    <Card>
      <h2 className={styles.heading}>{t('branchSettings.geofence')}</h2>
      <p className={styles.hint}>{hint}</p>

      <div className={styles.pair}>
        <FormInput
          label={t('errors.field.latitude')}
          icon={IoNavigateOutline}
          inputMode="decimal"
          autoComplete="off"
          value={value.latitude}
          onChange={(e) => set({ latitude: e.target.value })}
        />
        <FormInput
          label={t('errors.field.longitude')}
          icon={IoNavigateOutline}
          inputMode="decimal"
          autoComplete="off"
          value={value.longitude}
          onChange={(e) => set({ longitude: e.target.value })}
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.textAction} onClick={() => void useCurrentLocation()} disabled={isLocating}>
          {isLocating ? <Spinner size={14} /> : <IoLocateOutline size={16} aria-hidden="true" />}
          <span>{isLocating ? t('branchSettings.locating') : t('branchSettings.useCurrentLocation')}</span>
        </button>
        {point ? (
          <a href={mapLink(point)} target="_blank" rel="noopener noreferrer" className={styles.textAction}>
            <IoMapOutline size={16} aria-hidden="true" />
            <span>{t('web.branches.viewOnMap')}</span>
          </a>
        ) : null}
      </div>

      {locationError ? (
        <p className={styles.alert} role="alert">
          {locationError}
        </p>
      ) : null}

      <FormInput
        label={t('branchSettings.geofenceRadius')}
        icon={IoResizeOutline}
        inputMode="numeric"
        autoComplete="off"
        value={value.radius}
        onChange={(e) => set({ radius: e.target.value })}
        error={radiusError}
        className={canClear ? undefined : styles.last}
      />

      {canClear ? (
        check.radius !== null ? (
          <button type="button" className={cx(styles.textAction, styles.textActionMuted)} onClick={() => set({ radius: '' })}>
            <IoCloseCircleOutline size={16} aria-hidden="true" />
            <span>{t('branchSettings.clearGeofence')}</span>
          </button>
        ) : (
          <p className={styles.note}>{t('branchSettings.geofenceOff')}</p>
        )
      ) : null}
    </Card>
  );
}
