import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoArrowBack } from 'react-icons/io5';
import Enter from '@/components/ui/Enter';
import Pill, { type PillTone } from '@/components/ui/Pill';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import styles from './NoticePage.module.css';

type Props = {
  icon: IconType;
  title: string;
  body: string;
  badge?: string;
  badgeTone?: PillTone;
};

/**
 * A page that explains why there is nothing here — not built for the web yet,
 * not part of this role, or not an address at all — and offers the way home.
 */
export default function NoticePage({ icon: Icon, title, body, badge, badgeTone = 'brand' }: Props) {
  const { t } = useTranslation();
  useDocumentTitle(title);

  return (
    <Enter className={styles.card}>
      <div className={styles.head}>
        <span className={styles.iconTile} aria-hidden="true">
          <Icon size={24} />
        </span>
        {badge ? <Pill label={badge} tone={badgeTone} /> : null}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>{body}</p>
      <Link to="/" className={styles.back}>
        <IoArrowBack size={16} aria-hidden="true" />
        <span>{t('web.comingSoon.backHome')}</span>
      </Link>
    </Enter>
  );
}
