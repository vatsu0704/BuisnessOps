import { IoAlertCircle } from 'react-icons/io5';
import { cx } from '@/utils/cx';
import styles from './ErrorBanner.module.css';

/** A failure, in red, announced to a screen reader as it appears. */
export default function ErrorBanner({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cx(styles.banner, className)} role="alert">
      <IoAlertCircle className={styles.icon} size={16} aria-hidden="true" />
      <p className={styles.text}>{message}</p>
    </div>
  );
}
