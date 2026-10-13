import { useTranslation } from 'react-i18next';
import BrandMark from '@/components/brand/BrandMark';
import Wordmark from '@/components/brand/Wordmark';
import Spinner from '@/components/ui/Spinner';
import ScreenBackground from './ScreenBackground';
import styles from './FullPageLoader.module.css';

/**
 * Shown while a stored session is checked on load — the web's splash. The mark
 * draws itself, as it does on the phone's launch screen.
 */
export default function FullPageLoader() {
  const { t } = useTranslation();
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <ScreenBackground />
      <BrandMark width={96} />
      <Wordmark size={26} align="center" />
      <Spinner size={22} className={styles.spinner} />
      <p className="visually-hidden">{t('web.shell.loading')}</p>
    </div>
  );
}
