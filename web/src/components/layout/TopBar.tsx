import { useTranslation } from 'react-i18next';
import { IoMenu } from 'react-icons/io5';
import BrandMark from '@/components/brand/BrandMark';
import Wordmark from '@/components/brand/Wordmark';
import LanguageMenu from '@/components/LanguageMenu';
import BusinessMenu from './BusinessMenu';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';
import styles from './TopBar.module.css';

type Props = {
  sidebarId: string;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
};

/**
 * Which business this is and as whom — and a switch, for someone in more than
 * one — then the language, the notification bell and the account. Below
 * the desktop breakpoint it also carries the menu button and the brand, since
 * the sidebar that normally shows them is folded away.
 */
export default function TopBar({ sidebarId, sidebarOpen, onOpenSidebar }: Props) {
  const { t } = useTranslation();

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onOpenSidebar}
        aria-label={t('web.shell.openMenu')}
        aria-controls={sidebarId}
        aria-expanded={sidebarOpen}
      >
        <IoMenu size={22} aria-hidden="true" />
      </button>

      <div className={styles.compactBrand}>
        <BrandMark width={28} animate={false} />
        <Wordmark size={16} />
      </div>

      <div className={styles.context}>
        <BusinessMenu />
      </div>

      <div className={styles.actions}>
        <LanguageMenu />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
