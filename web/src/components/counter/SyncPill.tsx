import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoAlertCircleOutline, IoCloudOfflineOutline, IoCloudUploadOutline, IoLockClosedOutline } from 'react-icons/io5';
import type { CounterSyncState } from '@/types/counter';
import { cx } from '@/utils/cx';
import styles from './SyncPill.module.css';

/**
 * Where this browser's bills have got to (requirement 30) — the app's SyncPill.
 * Nothing at all when every bill is sent. Otherwise one line, most urgent first:
 * bills the server refused, then sending, blocked, offline, waiting.
 */
export default function SyncPill({
  state,
  pendingCount,
  attentionCount,
}: {
  state: CounterSyncState;
  pendingCount: number;
  attentionCount: number;
}) {
  const { t } = useTranslation();

  let icon: IconType;
  let text: string;
  let tone: 'error' | 'brand' | 'warning';
  if (attentionCount > 0) {
    icon = IoAlertCircleOutline;
    text = t('counter.sync.attention', { count: attentionCount });
    tone = 'error';
  } else if (pendingCount === 0) {
    return null;
  } else if (state === 'syncing') {
    icon = IoCloudUploadOutline;
    text = t('counter.sync.syncing', { count: pendingCount });
    tone = 'brand';
  } else if (state === 'blocked') {
    icon = IoLockClosedOutline;
    text = t('web.counter.sync.blocked', { count: pendingCount });
    tone = 'warning';
  } else if (state === 'offline') {
    icon = IoCloudOfflineOutline;
    text = t('web.counter.sync.offline', { count: pendingCount });
    tone = 'warning';
  } else {
    icon = IoCloudUploadOutline;
    text = t('counter.sync.pending', { count: pendingCount });
    tone = 'brand';
  }
  const Icon = icon;

  return (
    <p className={cx(styles.pill, styles[tone])} role="status">
      <Icon size={16} aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
