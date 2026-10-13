import type { IconType } from 'react-icons';
import { cx } from '@/utils/cx';
import styles from './ChipGroup.module.css';

export type ChipOption<V extends string> = {
  value: V;
  label: string;
  icon?: IconType;
  /** Colours for the selected chip — e.g. a status's own green or amber. Brand blue otherwise. */
  tone?: { fg: string; bg: string };
};

type Props<V extends string> = {
  name: string;
  /** Visible label above the chips; also the group's accessible name. */
  label?: string;
  /** Keep the label for screen readers only — when the page around it already says what it is. */
  hideLabel?: boolean;
  options: ChipOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  disabled?: boolean;
};

/**
 * A single choice as chips that are each the width of their own label, in a row
 * that wraps — the app's `AttendanceStatusPicker` shape. Use it past three
 * options, where a row that divides its width evenly stops holding the labels
 * (it broke that way twice in the app); nothing here breaks however long a
 * translation runs.
 */
export default function ChipGroup<V extends string>({
  name,
  label,
  hideLabel,
  options,
  value,
  onChange,
  disabled,
}: Props<V>) {
  return (
    <fieldset className={styles.group} disabled={disabled}>
      {label ? <legend className={cx(styles.label, hideLabel && 'visually-hidden')}>{label}</legend> : null}
      <div className={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          const Icon = option.icon;
          const toneStyle = selected && option.tone ? { color: option.tone.fg, background: option.tone.bg, borderColor: option.tone.fg } : undefined;
          return (
            <label key={option.value} className={cx(styles.chip, selected && styles.selected)} style={toneStyle}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="visually-hidden"
              />
              {Icon ? <Icon size={14} aria-hidden="true" /> : null}
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
