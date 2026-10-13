import { Link } from 'react-router';
import type { IconType } from 'react-icons';
import { cx } from '@/utils/cx';
import buttonStyles from './Button.module.css';
import primaryStyles from './PrimaryButton.module.css';

type Props = {
  to: string;
  title: string;
  icon?: IconType;
  /** The brand gradient, or the outlined secondary look. */
  variant?: 'primary' | 'secondary';
  className?: string;
};

/**
 * A link that looks like a button — "Add" at the top of a list. It goes
 * somewhere rather than doing something, so it is a link: it opens in a new tab
 * on a middle click and reads as a link to a screen reader.
 */
export default function ButtonLink({ to, title, icon: Icon, variant = 'primary', className }: Props) {
  const classes =
    variant === 'primary'
      ? cx(primaryStyles.button, primaryStyles.compact, className)
      : cx(buttonStyles.button, buttonStyles.secondary, className);
  return (
    <Link to={to} className={classes}>
      {Icon ? <Icon size={17} aria-hidden="true" /> : null}
      <span>{title}</span>
    </Link>
  );
}
