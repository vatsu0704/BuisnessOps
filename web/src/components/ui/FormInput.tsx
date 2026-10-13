import { useId, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoEyeOffOutline, IoEyeOutline } from 'react-icons/io5';
import { cx } from '@/utils/cx';
import styles from './FormInput.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  icon: IconType;
  isPassword?: boolean;
  /** Small muted note at the right end of the label row. */
  hint?: string;
  /** A problem with this field, said under it and announced with it. */
  error?: string | null;
};

/**
 * The app's `FormInput`: a label, an icon tile, the field, and for passwords an
 * eye that shows what was typed. The border and the icon tile turn brand blue
 * while the field has focus.
 */
export default function FormInput({ label, icon: Icon, isPassword, hint, error, type, className, ...rest }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  const [secure, setSecure] = useState(true);

  return (
    <div className={cx(styles.wrap, className)}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>

      <div className={cx(styles.field, error && styles.fieldInvalid)}>
        <span className={styles.iconBox} aria-hidden="true">
          <Icon size={18} />
        </span>
        <input
          id={id}
          className={styles.input}
          type={isPassword ? (secure ? 'password' : 'text') : (type ?? 'text')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            className={styles.eyeBox}
            onClick={() => setSecure((s) => !s)}
            aria-label={secure ? t('web.form.showPassword') : t('web.form.hidePassword')}
            aria-controls={id}
          >
            {secure ? <IoEyeOutline size={18} /> : <IoEyeOffOutline size={18} />}
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
