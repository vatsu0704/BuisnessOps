import { useId } from 'react';
import { todayISO } from '@shared/utils/date';
import DatePicker from './DatePicker';
import { cx } from '@/utils/cx';
import field from './FormInput.module.css';

type Props = {
  label: string;
  /** YYYY-MM-DD — the form the API takes. */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  /** Defaults to today: these record what happened. `null` for a date yet to come. */
  max?: string | null;
  /** Small muted note at the right end of the label row. */
  hint?: string;
  /** A sentence under the field saying what it is for. */
  description?: string;
  error?: string | null;
  disabled?: boolean;
  className?: string;
};

/**
 * A date in a form — `FormInput`'s label, hint, description and error rows
 * around a `DatePicker`.
 *
 * It borrows `FormInput.module.css` rather than repeating it, the way
 * `Popover.module.css` is shared by the two header menus: the label row and the
 * error line have to match the fields above and below this one exactly, and a
 * second copy of them is a second thing to keep in step.
 *
 * Pass `max={null}` for a date that may be in the future — a holiday being
 * planned. Everything else is a record of something that has happened, so the
 * default ceiling is today, mirroring the server's own guard.
 */
export default function DateField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  description,
  error,
  disabled,
  className,
}: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx(field.wrap, className)}>
      {/* A span, not a `<label for>`: a button is not a labelable element, so
          the association would be invalid and the click would not reach it.
          The control carries the same words as its `aria-label`. */}
      <div className={field.labelRow}>
        <span className={field.label}>{label}</span>
        {hint ? <span className={field.hint}>{hint}</span> : null}
      </div>

      <DatePicker
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max === null ? undefined : (max ?? todayISO())}
        describedBy={describedBy}
        disabled={disabled}
        invalid={Boolean(error)}
      />

      {description ? (
        <p id={descriptionId} className={field.description}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={field.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
