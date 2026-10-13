import type { IconType } from 'react-icons';
import { IoCheckmark } from 'react-icons/io5';
import { cx } from '@/utils/cx';
import styles from './OptionRow.module.css';

type Props = {
  /** The radio group's name — every row in one choice shares it. */
  name: string;
  value: string;
  title: string;
  /** Under the title: what makes a list of choices readable without trying each. */
  description?: string;
  icon?: IconType;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
};

/**
 * A full-width, single-select row — icon, title, description, tick — the app's
 * `OptionRow`. For a choice whose options each need a sentence; `ChoiceTile` and
 * `ChipGroup` are for ones that do not. A real radio underneath.
 */
export default function OptionRow({ name, value, title, description, icon: Icon, selected, onSelect, disabled }: Props) {
  return (
    <label className={cx(styles.row, selected && styles.selected, disabled && styles.disabled)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        className="visually-hidden"
      />
      {Icon ? (
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon size={17} />
        </span>
      ) : null}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
      <span className={styles.mark} aria-hidden="true">
        <IoCheckmark size={13} />
      </span>
    </label>
  );
}
