import styles from './ScreenBackground.module.css';

/**
 * The app's soft background: a pale indigo wash with three blurred colour
 * blobs drifting slowly. Fixed behind the page and ignored by the pointer.
 */
export default function ScreenBackground() {
  return (
    <div className={styles.background} aria-hidden="true">
      <span className={`${styles.blob} ${styles.indigo}`} />
      <span className={`${styles.blob} ${styles.violet}`} />
      <span className={`${styles.blob} ${styles.sky}`} />
    </div>
  );
}
