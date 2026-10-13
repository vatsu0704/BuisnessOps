import type { ButtonHTMLAttributes } from 'react';
import type { IconType } from 'react-icons';
import { cx } from '@/utils/cx';
import Spinner from './Spinner';
import styles from './Button.module.css';

type Variant = 'secondary' | 'danger' | 'dangerSolid';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  title: string;
  variant?: Variant;
  icon?: IconType;
  loading?: boolean;
  block?: boolean;
};

/**
 * Every button that is not the brand gradient (`PrimaryButton`):
 *
 * - `secondary` — the other choice beside a primary one: Cancel, Back, Edit.
 * - `danger` — the app's `DangerButton` outline: an action that leaves something
 *   behind, like logging out.
 * - `dangerSolid` — the last step of something that cannot be undone.
 */
export default function Button({
  title,
  variant = 'secondary',
  icon: Icon,
  loading,
  disabled,
  block,
  className,
  type,
  ...rest
}: Props) {
  return (
    <button
      type={type ?? 'button'}
      className={cx(styles.button, styles[variant], block && styles.block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} tone={variant === 'dangerSolid' ? 'white' : 'brand'} /> : null}
      {Icon && !loading ? <Icon size={17} aria-hidden="true" /> : null}
      <span>{title}</span>
    </button>
  );
}
