import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { IconType } from 'react-icons';
import { IoChevronForward } from 'react-icons/io5';
import { cx } from '@/utils/cx';
import styles from './InfoCard.module.css';

type Props = {
  icon: IconType;
  title: string;
  subtitle: string;
  /** A route to open. */
  to?: string;
  /** A page outside the app — the privacy policy — opened in a new tab. */
  href?: string;
  onClick?: () => void;
  className?: string;
};

/**
 * An icon tile, a title and a line under it — and a chevron when it goes
 * somewhere. A link when given `to` (or `href`, for a page outside the app), a
 * button when given `onClick`, otherwise just a card.
 */
export default function InfoCard({ icon: Icon, title, subtitle, to, href, onClick, className }: Props) {
  const interactive = !!to || !!href || !!onClick;
  const body: ReactNode = (
    <>
      <span className={styles.iconTile} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </span>
      {interactive ? <IoChevronForward className={styles.chevron} size={18} aria-hidden="true" /> : null}
    </>
  );
  const classes = cx(styles.card, interactive && styles.interactive, className);

  if (to) {
    return (
      <Link to={to} className={classes}>
        {body}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
