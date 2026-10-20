import type { IconType } from 'react-icons';
import { IoStorefrontOutline } from 'react-icons/io5';
import ChoiceTile from '@/components/ui/ChoiceTile';
import Picker from '@/components/ui/Picker';
import type { Branch } from '@/types/branch';
import { SEARCH_FROM, isSearchable } from '@shared/utils/optionSearch';
import { cx } from '@/utils/cx';
import styles from './BranchPicker.module.css';

/**
 * What a tile needs — a full branch, or the counter's own copy kept for an
 * offline start. A city and a region when the caller has them: they are not
 * drawn, but they are what somebody types when they cannot recall a branch's
 * exact name.
 */
type PickableBranch = Pick<Branch, 'id' | 'name' | 'code'> & Partial<Pick<Branch, 'city' | 'region'>>;

type Props<B extends PickableBranch> = {
  /** The radio group's name — unique per page. */
  name: string;
  /** The question, shown above the tiles as a section label. */
  legend: string;
  hideLegend?: boolean;
  branches: B[];
  value: string | null;
  onChange: (branchId: string) => void;
  /** The line under each name; the branch code unless said otherwise. */
  caption?: (branch: B) => string | undefined;
  /** Each tile's icon; a shop front unless said otherwise — a warehouse gets a box. */
  icon?: (branch: B) => IconType;
  /** Raise the threshold where branches are chosen at speed. See `SEARCH_FROM`. */
  searchFrom?: number;
};

/**
 * One branch out of several.
 *
 * Up to six, tiles in a grid that wraps — the app's grid of `SegmentedOption`s on
 * Products, Upload and Edit product, with the column count coming from the width.
 * At seven, a field you type into instead: a tile grid of two hundred branches is
 * a page nobody can get to the bottom of, and this is the control an owner with
 * two hundred of them meets on every screen.
 *
 * Products and Edit product leave it out for a single branch — a choice with one
 * option is not a choice. Upload shows it anyway, already chosen, because where
 * imported sales land is worth seeing before they land there.
 */
export default function BranchPicker<B extends PickableBranch>({
  name,
  legend,
  hideLegend,
  branches,
  value,
  onChange,
  caption = (branch) => branch.code,
  icon = () => IoStorefrontOutline,
  searchFrom = SEARCH_FROM,
}: Props<B>) {
  if (isSearchable(branches.length, searchFrom)) {
    return (
      <Picker
        name={name}
        label={legend}
        hideLabel={hideLegend}
        value={value}
        onChange={onChange}
        icon={branches[0] ? icon(branches[0]) : IoStorefrontOutline}
        searchFrom={searchFrom}
        options={branches.map((branch) => ({
          value: branch.id,
          label: branch.name,
          description: caption(branch),
          keywords: [branch.code, branch.city, branch.region],
          icon: icon(branch),
        }))}
      />
    );
  }

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
            icon={icon(branch)}
            selected={branch.id === value}
            onSelect={() => onChange(branch.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}
