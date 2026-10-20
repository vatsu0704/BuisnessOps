import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionRow from '@/components/OptionRow';
import Picker from '@/components/Picker';
import SegmentedOption from '@/components/SegmentedOption';
import type { Branch } from '@/types/branch';
import { SEARCH_FROM, isSearchable } from '@/utils/optionSearch';
import { colors, spacing, typography } from '@/theme';

/**
 * What this needs of a branch. The city and region are not drawn — they are what
 * somebody types when they cannot recall a shop's exact name.
 */
type PickableBranch = Pick<Branch, 'id' | 'name' | 'code'> & Partial<Pick<Branch, 'city' | 'region'>>;

type Props<B extends PickableBranch> = {
  label: string;
  hideLabel?: boolean;
  branches: B[];
  value: string | null;
  onChange: (branchId: string) => void;
  /** The line under each name; the branch code unless said otherwise. */
  caption?: (branch: B) => string | undefined;
  /** A shop front unless said otherwise — a warehouse gets a box. */
  icon?: (branch: B) => keyof typeof Ionicons.glyphMap;
  /** Raise the threshold where branches are chosen at speed, as the counter does. */
  searchFrom?: number;
  /**
   * How the short form draws. Chips where the branch is a filter above a list;
   * rows where it is one field of a form being filled in, which is what Add
   * product and Add expense already looked like.
   */
  flatAs?: 'chips' | 'rows';
  style?: StyleProp<ViewStyle>;
  testIDPrefix: string;
};

/**
 * Which branch.
 *
 * Ten screens wrote this out themselves — a wrapping grid of `SegmentedOption`s,
 * copied with small differences each time — and every copy showed the business's
 * whole list. That is fine at three branches and unusable at two hundred, which
 * is the size this product is meant to serve.
 *
 * Up to six it is the grid those screens already drew, two across so a name and
 * its code fit on a 320dp phone whatever the language. At seven it becomes a
 * field that opens a sheet with a box to type into. Nothing above the threshold
 * is a design change for a business that has not crossed it.
 *
 * A single branch draws nothing at all: a choice with one option is not a choice.
 * Upload is the exception and passes its own `searchFrom`, because where imported
 * sales land is worth seeing before they land there.
 */
export default function BranchField<B extends PickableBranch>({
  label,
  hideLabel,
  branches,
  value,
  onChange,
  caption = (branch) => branch.code,
  icon = () => 'storefront-outline',
  searchFrom = SEARCH_FROM,
  flatAs = 'chips',
  style,
  testIDPrefix,
}: Props<B>) {
  if (branches.length === 0) return null;

  if (isSearchable(branches.length, searchFrom)) {
    return (
      <View style={style}>
        <Picker
          testIDPrefix={testIDPrefix}
          label={label}
          hideLabel={hideLabel}
          icon={branches[0] ? icon(branches[0]) : 'storefront-outline'}
          value={value}
          onChange={onChange}
          searchFrom={searchFrom}
          options={branches.map((branch) => ({
            value: branch.id,
            label: branch.name,
            description: caption(branch),
            keywords: [branch.code, branch.city, branch.region],
            icon: icon(branch),
          }))}
        />
      </View>
    );
  }

  return (
    <View style={style}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      {flatAs === 'rows' ? (
        <View style={styles.rows}>
          {branches.map((branch) => (
            <OptionRow
              key={branch.id}
              testID={`${testIDPrefix}-option-${branch.id}`}
              title={branch.name}
              description={caption(branch)}
              icon={icon(branch)}
              selected={branch.id === value}
              onPress={() => onChange(branch.id)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          {branches.map((branch) => (
            <View key={branch.id} style={styles.cell}>
              <SegmentedOption
                testID={`${testIDPrefix}-option-${branch.id}`}
                title={branch.name}
                caption={caption(branch)}
                icon={icon(branch)}
                selected={branch.id === value}
                onPress={() => onChange(branch.id)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  rows: { gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Two across rather than an even share of the row: `SegmentedOption` sets
  // flex: 1, so six of them would get about 50dp each on a 320dp phone and every
  // label would break one character per line. `flexGrow` lets an odd last one
  // fill its row.
  cell: { flexGrow: 1, flexBasis: '46%' },
});
