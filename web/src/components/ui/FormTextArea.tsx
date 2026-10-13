import { useId, type TextareaHTMLAttributes } from 'react';
import type { IconType } from 'react-icons';
import { cx } from '@/utils/cx';
import styles from './FormInput.module.css';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  icon: IconType;
  hint?: string;
  /** A sentence under the field saying what it is for — read with the field by a screen reader. */
  description?: string;
  error?: string | null;
};

/**
 * `FormInput` for text that runs to several lines — an address with its
 * landmark, a note. The app's `FormInput multiline`.
 */
export default function FormTextArea({ label, icon: Icon, hint, description, error, className, rows = 3, ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx(styles.wrap, className)}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>

      <div className={cx(styles.field, styles.fieldTall, error && styles.fieldInvalid)}>
        <span className={styles.iconBox} aria-hidden="true">
          <Icon size={18} />
        </span>
        <textarea
          id={id}
          rows={rows}
          className={cx(styles.input, styles.textarea)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      </div>

      {description ? (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
