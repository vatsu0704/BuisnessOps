import type { ComponentPropsWithRef } from 'react';
import type { IconType } from 'react-icons';
import { cx } from '@/utils/cx';
import Spinner from './Spinner';
import styles from './PrimaryButton.module.css';

// With the ref: React 19 passes it as a prop, and the spread below puts it on the button.
type Props = Omit<ComponentPropsWithRef<'button'>, 'children' | 'title'> & {
  title: string;
  loading?: boolean;
  icon?: IconType;
  /** Stretch to the parent's width. Off, it is sized by its label — and still padded. */
  block?: boolean;
};

/**
 * The brand-gradient button. Sized by its label unless `block`, with its own
 * horizontal padding either way — the app learned that the hard way when the
 * first content-sized button put its label flush against both edges.
 */
export default function PrimaryButton({ title, loading, disabled, icon: Icon, block, className, type, ...rest }: Props) {
  return (
    <button
      type={type ?? 'button'}
      className={cx(styles.button, block && styles.block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={18} tone="white" /> : null}
      <span>{title}</span>
      {Icon && !loading ? <Icon size={18} aria-hidden="true" /> : null}
    </button>
  );
}
