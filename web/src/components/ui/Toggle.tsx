import { cx } from '@/utils/cx';
import styles from './Toggle.module.css';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Read by a screen reader — the visible label usually sits beside the switch. */
  label: string;
  disabled?: boolean;
};

/** An on/off switch — the app's native `Switch` — on a real checkbox with `role="switch"`. */
export default function Toggle({ checked, onChange, label, disabled }: Props) {
  return (
    <label className={cx(styles.toggle, disabled && styles.disabled)}>
      <input
        type="checkbox"
        role="switch"
        className="visually-hidden"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={cx(styles.track, checked && styles.on)} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </label>
  );
}
