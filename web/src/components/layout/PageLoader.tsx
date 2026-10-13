import Spinner from '@/components/ui/Spinner';
import styles from './PageLoader.module.css';

/** Inside the shell, while a page's code or first data is on its way. */
export default function PageLoader() {
  return (
    <div className={styles.wrap} role="status" aria-busy="true">
      <Spinner size={24} />
    </div>
  );
}
