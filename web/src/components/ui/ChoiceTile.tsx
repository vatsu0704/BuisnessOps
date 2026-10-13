import type { IconType } from 'react-icons';
import { cx } from '@/utils/cx';
import styles from './ChoiceTile.module.css';

type Props = {
  /** The radio group's name — every tile in one choice shares it. */
  name: string;
  value: string;
  title: string;
  caption?: string;
  icon?: IconType;
  selected: boolean;
  onSelect: () => void;
};

/**
 * One option of a single choice, as a tile — the app's `SegmentedOption` with a
 * caption. A real radio input underneath, so arrow keys move between options and
 * a screen reader hears "radio, 2 of 4, selected".
 *
 * Lay these out in a wrapping grid (`repeat(auto-fill, minmax(…, 1fr))`), never a
 * fixed row: a row that divides its width evenly is what broke the app's role
 * picker at six options and its status picker at four.
 */
export default function ChoiceTile({ name, value, title, caption, icon: Icon, selected, onSelect }: Props) {
  return (
    <label className={cx(styles.tile, selected && styles.selected)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="visually-hidden"
      />
      {Icon ? <Icon size={16} className={styles.icon} aria-hidden="true" /> : null}
      <span className={styles.title}>{title}</span>
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </label>
  );
}
