import { cx } from '@/utils/cx';
import styles from './Spinner.module.css';

type Props = { size?: number; tone?: 'brand' | 'white'; className?: string };

export default function Spinner({ size = 20, tone = 'brand', className }: Props) {
  return (
    <span
      className={cx(styles.spinner, tone === 'white' && styles.white, className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
