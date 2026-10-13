import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoArrowBack } from 'react-icons/io5';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import Enter from './Enter';
import styles from './PageHeader.module.css';

type Props = {
  title: string;
  subtitle?: string;
  /** Where "back" goes. The app's screens are modals over a tab; here, a link. */
  backTo?: string;
  /** Buttons at the right end; they wrap under the title on a narrow window. */
  actions?: ReactNode;
};

/** The top of every page but Home: back, title, a line under it, actions. Sets the tab's title too. */
export default function PageHeader({ title, subtitle, backTo, actions }: Props) {
  const { t } = useTranslation();
  useDocumentTitle(title);

  return (
    <Enter as="header" className={styles.header}>
      <div className={styles.titleRow}>
        {backTo ? (
          <Link to={backTo} className={styles.back} aria-label={t('web.common.back')}>
            <IoArrowBack size={20} aria-hidden="true" />
          </Link>
        ) : null}
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </Enter>
  );
}
