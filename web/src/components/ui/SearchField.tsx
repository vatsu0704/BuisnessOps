import type { InputHTMLAttributes } from 'react';
import { IoSearchOutline } from 'react-icons/io5';
import { cx } from '@/utils/cx';
import styles from './SearchField.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
  /** Its accessible name, and the placeholder: a search box explains itself. */
  label: string;
  value: string;
  onChange: (value: string) => void;
};

/**
 * A filter over a list already on the page — a compact field with the magnifier
 * inside, unlike `FormInput`, which belongs in a form and has a label above it.
 * The browser's own clear button and Escape both empty it.
 */
export default function SearchField({ label, value, onChange, className, ...rest }: Props) {
  return (
    <div className={cx(styles.field, className)}>
      <IoSearchOutline size={17} className={styles.icon} aria-hidden="true" />
      <input
        type="search"
        className={styles.input}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </div>
  );
}
