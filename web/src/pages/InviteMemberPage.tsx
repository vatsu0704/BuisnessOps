import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  IoArrowForward,
  IoBicycleOutline,
  IoBriefcaseOutline,
  IoCardOutline,
  IoCubeOutline,
  IoMailOutline,
  IoPersonOutline,
  IoReceiptOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';
import {
  BRANCH_SCOPED_ROLES,
  INVITABLE_ROLES,
  asBranchConflict,
  isSingleBranchRole,
  type InvitableRole,
} from '@shared/utils/teamRules';
import { extractErrorMessage } from '@/api/client';
import { inviteMember } from '@/api/team';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import CashierBranchPicker from '@/components/team/CashierBranchPicker';
import Card from '@/components/ui/Card';
import CheckChips from '@/components/ui/CheckChips';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import OptionRow from '@/components/ui/OptionRow';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { planAllowsRole } from '@/permissions';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { useCashierByBranch } from '@/hooks/useTeam';
import { pathTo } from '@/routes/paths';
import { refreshTeam } from '@/store/teamStore';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { isValidEmail } from '@/utils/validation';
import styles from './FormPage.module.css';

// Seven roles is past the point where a name alone identifies one at a glance,
// so each gets a glyph. A Record over InvitableRole, as in the app: a role added
// to the matrix fails `tsc` here until it has an icon, rather than rendering a
// row with a hole where every other row has a symbol.
const ROLE_ICONS: Record<InvitableRole, IconType> = {
  ADMIN: IoShieldCheckmarkOutline,
  MANAGER: IoBriefcaseOutline,
  WAREHOUSE: IoCubeOutline,
  CASHIER: IoReceiptOutline,
  DELIVERY_AGENT: IoBicycleOutline,
  // The same glyph as the Payments entry the role lands on: paying is the job.
  ACCOUNTANT: IoCardOutline,
  STAFF: IoPersonOutline,
};

/**
 * Invite somebody — the app's Invite member screen. An email that already has an
 * account joins at once; any other becomes a pending invite, claimed when that
 * email signs up.
 *
 * The roles come from the matrix, narrowed by the plan (requirement 28). A role
 * whose reach is not every branch asks which branches; a cashier asks for exactly
 * one, naming who runs each already (requirement 18) — and if the chosen branch
 * is taken, the server's 409 names the holder and the same request is sent again
 * with `confirm` once the admin agrees.
 */
export default function InviteMemberPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { tradingBranches: branches } = useBranches();
  // A hint, not the rule: the server enforces it, and its 409 names the holder.
  const cashierByBranch = useCashierByBranch();
  const goBack = useGoBack(pathTo('team'));

  // Only the roles this business's plan includes. A server from before plans
  // sends no plan, and then every role is offered, as it always was.
  const plan = useMembership()?.business.subscription?.plan;
  const offeredRoles = INVITABLE_ROLES.filter((r) => !plan || planAllowsRole(plan, r));

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('STAFF');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);
  const needsBranches = BRANCH_SCOPED_ROLES.has(role);
  const singleBranch = isSingleBranchRole(role);
  const canSubmit =
    !!businessId &&
    emailTrimmed.length > 0 &&
    !emailInvalid &&
    (!needsBranches || selectedBranchIds.length > 0) &&
    !isSubmitting;

  function toggleBranch(branchId: string) {
    setSelectedBranchIds((current) =>
      current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId]
    );
  }

  /**
   * Changing the role can leave a choice behind that is no longer allowed: two
   * branches picked for a staff member, then cashier chosen. Keep the first and
   * drop the rest, so nothing is refused for a choice no longer on screen.
   */
  function chooseRole(next: InvitableRole) {
    setRole(next);
    if (isSingleBranchRole(next)) setSelectedBranchIds((current) => current.slice(0, 1));
  }

  function send(id: string, confirmSwap: boolean) {
    return inviteMember(id, {
      email: emailTrimmed,
      role,
      branchIds: needsBranches ? selectedBranchIds : undefined,
      ...(confirmSwap ? { confirm: true } : {}),
    });
  }

  function done() {
    // The Team page and this page's own hints read one store, so the new member
    // reaches it before the list is shown again.
    void refreshTeam();
    goBack();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await send(businessId, false);
      done();
      return;
    } catch (err) {
      const conflict = asBranchConflict(err);
      setIsSubmitting(false);
      if (!conflict) {
        setError(extractErrorMessage(err));
        return;
      }
      const ok = await confirm({
        title: t('inviteMember.swapTitle'),
        body: t('inviteMember.swapBody', conflict),
        confirmLabel: t('inviteMember.swapConfirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }

    setIsSubmitting(true);
    try {
      await send(businessId, true);
      done();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader title={t('inviteMember.title')} subtitle={t('inviteMember.subtitle')} backTo={pathTo('team')} />

      <Enter delay={step(1)}>
        <Card>
          <FormInput
            label={t('inviteMember.email')}
            icon={IoMailOutline}
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('inviteMember.emailPlaceholder')}
            description={t('inviteMember.emailHint')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailInvalid ? t('inviteMember.emailInvalid') : null}
          />

          {/* A list rather than chips: seven roles cannot share a line, and each
              hint belongs beside the role it describes. */}
          <fieldset className={fieldStyles.fieldset}>
            <legend className={fieldStyles.heading}>{t('inviteMember.roleSection')}</legend>
            <div className={fieldStyles.legendGap} />
            <div className={fieldStyles.modelList}>
              {offeredRoles.map((r) => (
                <OptionRow
                  key={r}
                  name="invite-role"
                  value={r}
                  icon={ROLE_ICONS[r]}
                  title={t(`role.${r}`)}
                  description={t(`inviteMember.roleHint_${r}`)}
                  selected={role === r}
                  onSelect={() => chooseRole(r)}
                />
              ))}
            </div>
            {offeredRoles.length < INVITABLE_ROLES.length ? (
              <p className={fieldStyles.hint}>{t('plans.moreRoles')}</p>
            ) : null}
          </fieldset>
        </Card>
      </Enter>

      {needsBranches ? (
        <Enter delay={step(2)}>
          <Card>
            {singleBranch ? (
              <fieldset className={fieldStyles.fieldset}>
                <legend className={fieldStyles.heading}>{t('inviteMember.branchSection')}</legend>
                <p className={fieldStyles.hint}>{t('inviteMember.cashierBranchHint')}</p>
                <CashierBranchPicker
                  name="invite-branch"
                  branches={branches}
                  cashierByBranch={cashierByBranch}
                  selectedBranchId={selectedBranchIds[0] ?? null}
                  onSelect={(branchId) => setSelectedBranchIds([branchId])}
                />
              </fieldset>
            ) : branches.length === 0 ? (
              <>
                <h2 className={fieldStyles.heading}>{t('inviteMember.branchSection')}</h2>
                <p className={fieldStyles.hint}>{t('inviteMember.noBranches')}</p>
              </>
            ) : (
              // Several branches at once stays possible for everyone but a cashier:
              // a delivery agent covering three branches is a real shape. The
              // heading matches the role question's; the chips keep it as their name.
              <>
                <h2 className={fieldStyles.heading} aria-hidden="true">
                  {t('inviteMember.branchSection')}
                </h2>
                <div className={fieldStyles.legendGap} />
                <CheckChips
                  label={t('inviteMember.branchSection')}
                  hideLabel
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  selected={selectedBranchIds}
                  onToggle={toggleBranch}
                />
              </>
            )}
          </Card>
        </Enter>
      ) : null}

      <Enter delay={step(3)} className={styles.submit}>
        {error ? <ErrorBanner key={error} message={error} /> : null}
        <PrimaryButton
          type="submit"
          block
          title={isSubmitting ? t('inviteMember.submitting') : t('inviteMember.submit')}
          icon={IoArrowForward}
          loading={isSubmitting}
          disabled={!canSubmit}
        />
      </Enter>
    </form>
  );
}
