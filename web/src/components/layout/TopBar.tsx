import { useTranslation } from 'react-i18next';
import { IoMenu } from 'react-icons/io5';
import BrandMark from '@/components/brand/BrandMark';
import Wordmark from '@/components/brand/Wordmark';
import LanguageMenu from '@/components/LanguageMenu';
import Pill from '@/components/ui/Pill';
import { useMembership } from '@/hooks/useBusinessId';
import { useAuthStore } from '@/store/authStore';
import UserMenu from './UserMenu';
import styles from './TopBar.module.css';

type Props = {
  sidebarId: string;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
};

/**
 * Which business this is and as whom, then the language and the account. Below
 * the desktop breakpoint it also carries the menu button and the brand, since
 * the sidebar that normally shows them is folded away.
 */
export default function TopBar({ sidebarId, sidebarOpen, onOpenSidebar }: Props) {
  const { t } = useTranslation();
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();

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
        {business ? <p className={styles.business}>{business.name}</p> : null}
        {membership ? <Pill label={t(`role.${membership.role}`)} tone="muted" /> : null}
      </div>

      <div className={styles.actions}>
        <LanguageMenu />
        <UserMenu />
      </div>
    </header>
  );
}
