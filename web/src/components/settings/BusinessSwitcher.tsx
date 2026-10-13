import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage } from '@/api/client';
import Card from '@/components/ui/Card';
import OptionRow from '@/components/ui/OptionRow';
import { useAuthStore } from '@/store/authStore';
import { switchableMemberships } from '@/utils/permissions';
import styles from './Settings.module.css';

/**
 * Choose which business the app acts under — the app's `BusinessSwitcher`.
 * Renders nothing for the common case of one business, so a single-business
 * owner never sees a control with no alternative to offer.
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
      <div className={styles.options} role="radiogroup" aria-label={t('businessSwitcher.title')}>
        {memberships.map((membership) => (
          <OptionRow
            key={membership.id}
            name="business"
            value={membership.businessId}
            title={membership.business.name}
            description={t(`role.${membership.role}`)}
            selected={membership.businessId === activeBusinessId}
            disabled={isSwitching}
            onSelect={() => void select(membership.businessId)}
          />
        ))}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
