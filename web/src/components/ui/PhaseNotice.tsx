import type { IconType } from 'react-icons';
import Pill from './Pill';
import styles from './PhaseNotice.module.css';

type Props = {
  icon: IconType;
  badge: string;
  title: string;
  body: string;
};

/** A card that says plainly why something is not here yet. */
export default function PhaseNotice({ icon: Icon, badge, title, body }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.iconTile} aria-hidden="true">
          <Icon size={20} />
        </span>
        <Pill label={badge} />
      </div>
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
    </div>
  );
}
