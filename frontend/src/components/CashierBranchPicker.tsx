import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import OptionRow from '@/components/OptionRow';
import { colors, spacing } from '@/theme';
import type { Branch } from '@/types/branch';
import type { TeamMember } from '@/types/team';

/**
 * Pick the one branch a cashier runs, saying who runs each one already.
 *
 * Requirement 18 makes this a **single**-select list, and that is the whole
 * reason it exists as a component rather than as the multi-select chips the
 * invite screen used: a cashier holds exactly one branch, so offering tick-boxes
 * offers a choice the server refuses. Two screens ask the same question — the
 * invite screen before somebody joins, the Team screen when moving somebody — so
 * it lives here rather than being written twice and drifting.
 *
 * ## It says who holds each branch before you choose
 *
 * The admin's mistake to avoid is picking an occupied branch and only then being
 * told. So each row carries its current cashier as its description, which is what
 * turns the swap from a surprise into a decision. The rows are **not disabled**:
 * moving a branch to another cashier is explicitly allowed (the requirement says
 * "admin can switch to another cashier for that branch"), it just has to be
 * confirmed. Greying them out would hide a supported action.
 *
 * ## Why OptionRow
 *
 * Stacked full-width rows, so a business with twenty branches costs height rather
 * than breaking the layout — and every row has room for a sentence naming its
 * cashier, which no chip does. `SegmentedOption` stops working at four options;
 * this list has as many options as the business has branches.
 */

type Props = {
  /** Trading branches only — a warehouse has no till, so it has no cashier. */
  branches: Branch[];
  /** Branch id to the cashier holding it, from `useCashierByBranch()`. */
  cashierByBranch: Map<string, TeamMember>;
  selectedBranchId: string | null;
  onSelect: (branchId: string) => void;
  /**
   * The cashier being assigned, when there is one. Their own branch is not
   * described as taken — it is theirs, and picking it again is a no-op rather
   * than a conflict with themselves.
   */
  forMembershipId?: string;
  testIDPrefix: string;
};

export default function CashierBranchPicker({
  branches,
  cashierByBranch,
  selectedBranchId,
  onSelect,
  forMembershipId,
  testIDPrefix,
}: Props) {
  const { t } = useTranslation();

  if (branches.length === 0) {
    return <Text style={styles.empty}>{t('inviteMember.noBranches')}</Text>;
  }

  return (
    <View style={styles.list}>
      {branches.map((branch) => {
        const holder = cashierByBranch.get(branch.id);
        const isTheirOwn = !!holder && holder.id === forMembershipId;
        return (
          <OptionRow
            key={branch.id}
            testID={`${testIDPrefix}-${branch.code}`}
            icon="storefront-outline"
            title={branch.name}
            description={
              isTheirOwn
                ? t('inviteMember.branchTheirs')
                : holder
                  ? t('inviteMember.branchHeldBy', { name: holder.user.name ?? holder.user.email })
                  : t('inviteMember.branchFree')
            }
            selected={selectedBranchId === branch.id}
            onPress={() => onSelect(branch.id)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  empty: { fontSize: 12.5, color: colors.textTertiary },
});
