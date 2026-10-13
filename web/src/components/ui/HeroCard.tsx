import type { IconType } from 'react-icons';
import styles from './HeroCard.module.css';

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon?: IconType;
};

/** The brand-gradient card with a large faded icon behind its text. */
export default function HeroCard({ eyebrow, title, subtitle, icon: Icon }: Props) {
  return (
    <div className={styles.hero}>
      {Icon ? <Icon className={styles.icon} size={96} aria-hidden="true" /> : null}
      <p className={styles.eyebrow}>{eyebrow}</p>
      <p className={styles.title}>{title}</p>
      <p className={styles.subtitle}>{subtitle}</p>
    </div>
  );
}
