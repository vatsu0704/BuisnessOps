import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoBicycleOutline, IoCardOutline, IoCheckmarkCircleOutline, IoTimeOutline } from 'react-icons/io5';
import { supplyStatusKey } from '@shared/utils/supplyStatus';
import type { SupplyOrderEvent } from '@/types/supply';
import { cx } from '@/utils/cx';
import { formatTime } from '@/utils/date';
import styles from './SupplyTimeline.module.css';

// A Record over every event type, so one added to the backend enum fails `tsc`
// here until someone picks its icon and tint.
const ICONS: Record<SupplyOrderEvent['type'], IconType> = {
  STATUS_CHANGE: IoCheckmarkCircleOutline,
  DELAY: IoTimeOutline,
  PAYMENT: IoCardOutline,
  ASSIGNMENT: IoBicycleOutline,
};

const TINTS: Record<SupplyOrderEvent['type'], string> = {
  STATUS_CHANGE: styles.brand,
  DELAY: styles.warning,
  PAYMENT: styles.success,
  ASSIGNMENT: styles.brand,
};

/**
 * Everything that has happened to an order — requirement 5.1, the app's
 * `SupplyTimeline`. Nothing here is server prose: a status and a `reasonCode` are
 * translated here, and only the person's own `note` is shown as typed.
 */
export default function SupplyTimeline({
  events,
  fromVendor = false,
}: {
  events: SupplyOrderEvent[];
  /** A vendor's order words two of its statuses differently — see `supplyStatusKey`. */
  fromVendor?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <ol className={styles.list}>
      {events.map((event, index) => {
        const Icon = ICONS[event.type];
        const actor = event.actorMembership?.user?.name;
        const headline =
          event.type === 'DELAY'
            ? t('supply.delayBadge', { minutes: event.delayMinutes ?? 0 })
            : // The agent's name travels in `note`, snapshotted when the run was
              // given, and goes inside this browser's own sentence.
              event.type === 'ASSIGNMENT'
              ? t('supply.assignedTo', { name: event.note ?? t('supply.assignUnnamed') })
              : event.toStatus
                ? t(supplyStatusKey(event.toStatus, fromVendor))
                : event.reasonCode
                  ? t(`supplyEvent.${event.reasonCode}` as never)
                  : '';
        // A rejection carries a status and a reason, a delay only the reason;
        // shown on its own line so "Cancelled — out of stock" keeps both.
        const reason = event.reasonCode && event.type !== 'PAYMENT' ? t(`supplyDelay.${event.reasonCode}` as never) : null;

        return (
          <li key={event.id} className={styles.row}>
            <span className={styles.rail} aria-hidden="true">
              <span className={cx(styles.dot, TINTS[event.type])}>
                <Icon size={12} />
              </span>
              {index < events.length - 1 ? <span className={styles.line} /> : null}
            </span>
            <div className={styles.body}>
              <div className={styles.headline}>
                <p className={styles.headlineText}>{headline}</p>
                <time className={styles.time} dateTime={event.createdAt}>
                  {formatTime(event.createdAt, t)}
                </time>
              </div>
              {reason ? <p className={styles.reason}>{reason}</p> : null}
              {/* An assignment's note is the name in the headline already. */}
              {event.note && event.type !== 'ASSIGNMENT' ? <p className={styles.note}>{event.note}</p> : null}
              {actor ? <p className={styles.actor}>{t('supply.byWhom', { name: actor })}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
