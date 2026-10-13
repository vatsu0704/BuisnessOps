import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoArrowBack } from 'react-icons/io5';
import BrandMark from '@/components/brand/BrandMark';
import Wordmark from '@/components/brand/Wordmark';
import LanguageMenu from '@/components/LanguageMenu';
import styles from './AuthHeader.module.css';

type Props = {
  /** A route to go back to, shown as a round arrow button before the mark. */
  backTo?: string;
  caption?: string;
};

/**
 * The sign-in and sign-up header: mark, name and the language control. The name
 * takes whatever the row leaves, so on a narrow window it stacks rather than
 * pushing the language control off the edge.
 */
export default function AuthHeader({ backTo, caption }: Props) {
  const { t } = useTranslation();
  return (
    <header className={styles.row}>
      {backTo ? (
        <Link to={backTo} className={styles.back} aria-label={t('web.common.back')}>
          <IoArrowBack size={20} aria-hidden="true" />
        </Link>
      ) : null}
      <BrandMark width={40} />
      <div className={styles.name}>
        <Wordmark size={20} />
        {caption ? <p className={styles.caption}>{caption}</p> : null}
      </div>
      <LanguageMenu />
    </header>
  );
}
