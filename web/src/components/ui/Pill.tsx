import type { IconType } from 'react-icons';
import { cx } from '@/utils/cx';
import styles from './Pill.module.css';

export type PillTone = 'brand' | 'muted' | 'success' | 'warning' | 'danger';

type Props = {
  label: string;
  icon?: IconType;
  /** Colour never carries the meaning alone — the label always says it too. */
  tone?: PillTone;
  className?: string;
};

export default function Pill({ label, icon: Icon, tone = 'brand', className }: Props) {
  return (
    <span className={cx(styles.pill, styles[tone], className)}>
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      <span>{label}</span>
    </span>
  );
}
