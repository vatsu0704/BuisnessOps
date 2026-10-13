import { cx } from '@/utils/cx';
import styles from './ChipGroup.module.css';

export type CheckChipOption<V extends string | number> = {
  value: V;
  label: string;
  /** This one cannot be switched on or off just now — say why somewhere near it. */
  disabled?: boolean;
};

type Props<V extends string | number> = {
  /** The group's accessible name; shown above the chips unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  options: CheckChipOption<V>[];
  selected: readonly V[];
  onToggle: (value: V) => void;
  disabled?: boolean;
};

/**
 * Several choices at once, as chips the width of their own label in a row that
 * wraps — `ChipGroup`'s look with checkboxes underneath, for a set such as the
 * weekly off days.
 */
export default function CheckChips<V extends string | number>({
  label,
  hideLabel,
  options,
  selected,
  onToggle,
  disabled,
}: Props<V>) {
  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={cx(styles.label, hideLabel && 'visually-hidden')}>{label}</legend>
      <div className={styles.chips}>
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={cx(styles.chip, on && styles.selected, option.disabled && styles.chipDisabled)}
            >
              <input
                type="checkbox"
                value={option.value}
                checked={on}
                disabled={option.disabled}
                onChange={() => onToggle(option.value)}
                className="visually-hidden"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
