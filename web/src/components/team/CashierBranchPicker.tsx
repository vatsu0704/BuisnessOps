import { useTranslation } from 'react-i18next';
import { IoStorefrontOutline } from 'react-icons/io5';
import Picker from '@/components/ui/Picker';
import type { Branch } from '@/types/branch';
import type { TeamMember } from '@/types/team';
import styles from './CashierBranchPicker.module.css';

type Props = {
  /** The radio group's name — unique per page. */
  name: string;
  /** Trading branches only — a warehouse has no till, so it has no cashier. */
  branches: Branch[];
  /** Branch id to the cashier holding it, from `useCashierByBranch()`. */
  cashierByBranch: Map<string, TeamMember>;
  selectedBranchId: string | null;
  onSelect: (branchId: string) => void;
  /**
   * The cashier being assigned, when there is one. Their own branch is not
   * described as taken — it is theirs, and choosing it again changes nothing.
   */
  forMembershipId?: string;
  disabled?: boolean;
};

/**
 * The one branch a cashier runs, saying who runs each one already — the app's
 * `CashierBranchPicker`, on Invite and on Team.
 *
 * Requirement 18 makes it single-select: tick-boxes would offer a second branch
 * the server refuses. Each row names its current cashier before anyone chooses,
 * which turns the swap from a surprise into a decision; the rows are **not**
 * disabled, because moving a branch to another cashier is allowed — it is just
 * asked first. Stacked rows, so twenty branches cost height, not layout.
 *
 * Twenty was the budget this was written to. Past six it is a field to type
 * into, which is what two hundred branches need — and the reason the rows are
 * built through `Picker` rather than as radios there is specific: in a radio
 * group the arrow keys *select* as they move, so arrowing down a filtered list
 * of two hundred would reassign the cashier two hundred times.
 *
 * Who holds a branch stays this component's business, not the picker's: a
 * generic control that knew about memberships would be the same mistake as one
 * that checked a role name.
 */
export default function CashierBranchPicker({
  name,
  branches,
  cashierByBranch,
  selectedBranchId,
  onSelect,
  forMembershipId,
  disabled,
}: Props) {
  const { t } = useTranslation();

  if (branches.length === 0) {
    return <p className={styles.empty}>{t('inviteMember.noBranches')}</p>;
  }

  const options = branches.map((branch) => {
    const holder = cashierByBranch.get(branch.id);
    const isTheirOwn = !!holder && holder.id === forMembershipId;
    return {
      value: branch.id,
      label: branch.name,
      description: isTheirOwn
        ? t('inviteMember.branchTheirs')
        : holder
          ? t('inviteMember.branchHeldBy', { name: holder.user.name ?? holder.user.email })
          : t('inviteMember.branchFree'),
      // Taken by somebody else: choosable, and marked, because the swap is
      // allowed and only asked about.
      tone: holder && !isTheirOwn ? ('warn' as const) : ('default' as const),
      keywords: [branch.code, branch.city, branch.region, holder?.user.name, holder?.user.email],
      icon: IoStorefrontOutline,
    };
  });

  return (
    <div className={styles.list}>
      <Picker
        name={name}
        label={t('inviteMember.cashierBranchHint')}
        hideLabel
        options={options}
        value={selectedBranchId}
        onChange={onSelect}
        disabled={disabled}
      />
    </div>
  );
}
