import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage } from '@/api/client';
import Card from '@/components/ui/Card';
import Picker from '@/components/ui/Picker';
import { useAuthStore } from '@/store/authStore';
import { switchableMemberships } from '@/utils/permissions';
import styles from './Settings.module.css';

/**
 * Choose which business the app acts under — the app's `BusinessSwitcher`.
 * Renders nothing for the common case of one business, so a single-business
 * owner never sees a control with no alternative to offer.
 *
 * A dropdown whatever the count (`searchFrom={1}`), matching the phone: this is
 * a setting touched rarely, and the list grows with the person rather than with
 * the product. `Picker` adds the box to type in by itself once there are enough
 * businesses to need one.
 */
export default function BusinessSwitcher() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const switchBusiness = useAuthStore((s) => s.switchBusiness);
  const isSwitching = useAuthStore((s) => s.isSwitchingBusiness);
  const [error, setError] = useState<string | null>(null);

  const memberships = switchableMemberships(user);
  if (memberships.length < 2) return null;

  async function select(businessId: string) {
    if (isSwitching || businessId === activeBusinessId) return;
    setError(null);
    try {
      await switchBusiness(businessId);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Card title={t('businessSwitcher.title')}>
      <p className={styles.hint}>{t('businessSwitcher.hint')}</p>
      <Picker
        name="business"
        label={t('businessSwitcher.title')}
        hideLabel
        searchFrom={1}
        disabled={isSwitching}
        value={activeBusinessId}
        onChange={(businessId) => void select(businessId)}
        options={memberships.map((membership) => ({
          value: membership.businessId,
          label: membership.business.name,
          description: t(`role.${membership.role}`),
        }))}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
