import { useTranslation } from 'react-i18next';
import AnimatedLogo from '@/components/brand/AnimatedLogo';
import Spinner from '@/components/ui/Spinner';
import ScreenBackground from './ScreenBackground';
import styles from './FullPageLoader.module.css';

/**
 * Shown while a stored session is checked on load — the web's splash. The mark
 * draws itself, as it does on the phone's launch screen.
 *
 * ## It draws itself once per visit, not once per page
 *
 * This is the `Suspense` fallback for **every** lazy route and for both auth
 * guards, so it is what paints between any two pages. A 1.2s draw-in replayed
 * on every navigation would turn the logo into a stutter in the middle of the
 * app — the thing a preloader is supposed to prevent. A plain module-scope flag
 * is the whole mechanism: the first mount in this document animates and every
 * later one shows the finished lockup. It resets on a real page load, which is
 * exactly when the animation is wanted again.
 */
let hasPlayed = false;

export default function FullPageLoader() {
  const { t } = useTranslation();
  const animate = !hasPlayed;
  hasPlayed = true;

  return (
    <div className={styles.page} role="status" aria-live="polite">
      <ScreenBackground />
      <AnimatedLogo size={96} autoplay={animate} />
      <Spinner size={22} className={styles.spinner} />
      <p className="visually-hidden">{t('web.shell.loading')}</p>
    </div>
  );
}
