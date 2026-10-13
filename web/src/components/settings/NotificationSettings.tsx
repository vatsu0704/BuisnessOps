import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoInformationCircleOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { getNotificationPreferences, setNotificationPreference } from '@/api/notifications';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import Toggle from '@/components/ui/Toggle';
import type { NotificationCategory, NotificationPreference } from '@/types/notification';
import styles from './NotificationSettings.module.css';

type LabelKeys = { title: `notificationCentre.${string}`; hint: `notificationCentre.${string}` };

/** `Record` over every category, so a new one fails `tsc` until it has words. */
const LABELS: Record<NotificationCategory, LabelKeys> = {
  attendance: { title: 'notificationCentre.categoryAttendance', hint: 'notificationCentre.categoryAttendanceHint' },
  orders: { title: 'notificationCentre.categoryOrders', hint: 'notificationCentre.categoryOrdersHint' },
  delays: { title: 'notificationCentre.categoryDelays', hint: 'notificationCentre.categoryDelaysHint' },
  payments: { title: 'notificationCentre.categoryPayments', hint: 'notificationCentre.categoryPaymentsHint' },
  deliveries: { title: 'notificationCentre.categoryDeliveries', hint: 'notificationCentre.categoryDeliveriesHint' },
};

/**
 * Requirement 8 — what to be told about, the app's NotificationSettings card. One
 * switch per category, saved at once; a category the server marks required shows
 * "Always on" instead of a switch.
 *
 * The app's line about whether this device will receive notifications has no
 * web counterpart yet: a browser does not pop them up until browser push exists,
 * so the card says where they arrive instead.
 */
export default function NotificationSettings() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<NotificationCategory | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setPreferences(await getNotificationPreferences());
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(category: NotificationCategory, enabled: boolean) {
    setSaving(category);
    setPreferences((current) => current.map((p) => (p.category === category ? { ...p, enabled } : p)));
    try {
      setPreferences(await setNotificationPreference(category, enabled));
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
      await load();
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card title={t('notificationCentre.preferencesSection')}>
      <p className={styles.note}>
        <IoInformationCircleOutline size={16} aria-hidden="true" />
        <span>{t('web.notifications.browserNote')}</span>
      </p>
      <p className={styles.hint}>{t('notificationCentre.preferencesHint')}</p>

      {isLoading && preferences.length === 0 ? (
        <div className={styles.loading}>
          <Spinner size={20} />
        </div>
      ) : (
        <ul className={styles.list}>
          {preferences.map((preference) => {
            const label = LABELS[preference.category];
            if (!label) return null;
            const title = t(label.title as 'notificationCentre.categoryOrders');
            return (
              <li key={preference.category} className={styles.row}>
                <span className={styles.text}>
                  <span className={styles.title}>{title}</span>
                  <span className={styles.rowHint}>{t(label.hint as 'notificationCentre.categoryOrdersHint')}</span>
                </span>
                {preference.required ? (
                  <span className={styles.required}>{t('notificationCentre.required')}</span>
                ) : (
                  <Toggle
                    label={title}
                    checked={preference.enabled}
                    disabled={saving === preference.category}
                    onChange={(next) => void toggle(preference.category, next)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
