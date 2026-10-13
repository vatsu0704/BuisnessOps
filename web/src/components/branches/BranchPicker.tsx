import { IoStorefrontOutline } from 'react-icons/io5';
import ChoiceTile from '@/components/ui/ChoiceTile';
import type { Branch } from '@/types/branch';
import { cx } from '@/utils/cx';
import styles from './BranchPicker.module.css';

type Props = {
  /** The radio group's name — unique per page. */
  name: string;
  /** The question, shown above the tiles as a section label. */
  legend: string;
  hideLegend?: boolean;
  branches: Branch[];
  value: string | null;
  onChange: (branchId: string) => void;
  /** The line under each name; the branch code unless said otherwise. */
  caption?: (branch: Branch) => string | undefined;
};

/**
 * One branch out of several, as tiles in a grid that wraps — the app's grid of
 * `SegmentedOption`s on Products, Upload and Edit product. The column count
 * comes from the width, so five branches or fifty lay out the same way.
 *
 * Products and Edit product leave it out for a single branch — a choice with one
 * option is not a choice. Upload shows it anyway, already chosen, because where
 * imported sales land is worth seeing before they land there.
 */
export default function BranchPicker({
  name,
  legend,
  hideLegend,
  branches,
  value,
  onChange,
  caption = (branch) => branch.code,
}: Props) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={cx(styles.legend, hideLegend && 'visually-hidden')}>{legend}</legend>
      <div className={styles.grid}>
        {branches.map((branch) => (
          <ChoiceTile
            key={branch.id}
            name={name}
            value={branch.id}
            title={branch.name}
            caption={caption(branch)}
            icon={IoStorefrontOutline}
            selected={branch.id === value}
            onSelect={() => onChange(branch.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}
