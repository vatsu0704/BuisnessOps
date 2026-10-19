import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IoArrowForward,
  IoBriefcaseOutline,
  IoCashOutline,
  IoCubeOutline,
  IoMailOutline,
  IoPersonCircleOutline,
  IoPersonOutline,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { staffBase } from '@shared/permissions/staffBase';
import { extractErrorMessage } from '@/api/client';
import { createStaffMember } from '@/api/staff';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import SetupNote from '@/components/staff/SetupNote';
import StaffBranchPicker from '@/components/staff/StaffBranchPicker';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { useTeam } from '@/hooks/useTeam';
import { pathTo } from '@/routes/paths';
import { refreshMyStaff } from '@/store/myStaffStore';
import { step } from '@/theme/motion';
import { hasCapability } from '@/utils/permissions';
import { isValidEmail, parseOptionalNumber } from '@/utils/validation';
import styles from './FormPage.module.css';
import pageStyles from './StaffForm.module.css';

/**
 * Add a staff member — the app's Add staff screen.
 *
 * **Who they are comes first**, the email with it, because the answer decides the
 * next question: an email the business already knows names a role, and the role
 * decides where the person can be based (`staffBase`, asked of the capability
 * matrix, never of a role name). The warehouse desk is based at a warehouse; a
 * role that reaches every branch is not asked at all, and the line says where the
 * record will be filed; anyone else picks any location.
 *
 * Pay is offered only with `staff:setPay` — the server refuses the whole request
 * from anyone else who sends it, so it is left out of theirs.
 */
export default function AddStaffPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { branches, warehouseBranches } = useBranches();
  // Fetched only for someone who may read the team; empty for anyone else, and
  // then the page asks the ordinary question, as the app does for a cashier.
  const { members: team } = useTeam();
  const goBack = useGoBack(pathTo('staff'));

  const canSetPay = hasCapability(membership, 'staff:setPay');
  // The way out of an empty picker, offered only to someone who may take it.
  const canAddBranch = hasCapability(membership, 'branch:create');

  const [branchId, setBranchId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [roleTouched, setRoleTouched] = useState(false);
  const [baseSalary, setBaseSalary] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);

  /** Who this email already is in this business — the one field that identifies a person it knows. */
  const matched = useMemo(() => {
    const needle = emailTrimmed.toLowerCase();
    if (!needle) return null;
    return team.find((m) => m.user.email.toLowerCase() === needle && m.status === 'ACTIVE') ?? null;
  }, [team, emailTrimmed]);

  const baseQuestion = staffBase(matched?.role);

  /**
   * The locations this person may actually be based at. `PREMISES`: the
   * warehouses, and empty is the honest answer when there are none. `NONE`: not
   * asked — the business's own premises if it has one, else its oldest location,
   * a list of one. `ANY`: every location.
   */
  const options = useMemo(() => {
    if (baseQuestion === 'PREMISES') return warehouseBranches;
    if (baseQuestion === 'ANY') return branches;
    const implied = warehouseBranches[0] ?? branches[0];
    return implied ? [implied] : [];
  }, [baseQuestion, branches, warehouseBranches]);

  // Keep the choice inside what is on offer, and take it when there is only one.
  // Typing an email can change the question under a choice already made, so a
  // choice no longer offered is dropped rather than quietly sent.
  useEffect(() => {
    if (branchId) {
      if (!options.some((b) => b.id === branchId)) setBranchId(null);
      return;
    }
    if (options.length === 1) setBranchId(options[0].id);
  }, [branchId, options]);

  // Their membership role as the job title — a suggestion while the field is
  // untouched, never an overwrite, and cleared with the email it came from.
  useEffect(() => {
    if (roleTouched) return;
    setRole(matched ? t(`role.${matched.role}`) : '');
  }, [matched, roleTouched, t]);

  const baseSalaryParsed = parseOptionalNumber(baseSalary);
  const baseSalaryInvalid = baseSalaryParsed === null;
  const canSubmit =
    !!businessId &&
    !!branchId &&
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    !emailInvalid &&
    !baseSalaryInvalid &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !businessId || !branchId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createStaffMember(businessId, {
        branchId,
        name: name.trim(),
        role: role.trim(),
        ...(canSetPay ? { baseSalary: baseSalaryParsed ?? undefined } : {}),
        email: emailTrimmed || undefined,
      });
      // Somebody adding themselves gets Home's punch card at once.
      void refreshMyStaff();
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  const matchedRole = t(`role.${matched?.role ?? 'STAFF'}`);

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      <PageHeader title={t('addStaff.title')} subtitle={t('addStaff.subtitle')} backTo={pathTo('staff')} />

      <Enter delay={step(1)}>
        <Card title={t('addStaff.personSection')}>
          <FormInput
            label={t('addStaff.email')}
            hint={t('addStaff.emailHint')}
            icon={IoMailOutline}
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('addStaff.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailInvalid ? t('addStaff.emailInvalid') : null}
          />
          {matched ? (
            <p className={pageStyles.match}>
              <IoPersonCircleOutline size={18} aria-hidden="true" />
              <span>
                {t('addStaff.knownMember', { name: matched.user.name ?? matched.user.email, role: matchedRole })}
              </span>
            </p>
          ) : null}
          <FormInput
            label={t('addStaff.name')}
            icon={IoPersonOutline}
            autoComplete="off"
            placeholder={t('addStaff.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FormInput
            label={t('addStaff.role')}
            icon={IoBriefcaseOutline}
            autoComplete="off"
            placeholder={t('addStaff.rolePlaceholder')}
            value={role}
            onChange={(e) => {
              setRoleTouched(true);
              setRole(e.target.value);
            }}
          />
        </Card>
      </Enter>

      <Enter delay={step(2)}>
        <Card title={baseQuestion === 'ANY' ? t('addStaff.branchSection') : t('addStaff.branchHomeSection')}>
          {branches.length === 0 ? (
            <SetupNote
              icon={IoStorefrontOutline}
              text={t('addStaff.needsBranch')}
              action={canAddBranch ? { label: t('addStaff.addBranch'), to: pathTo('addBranch') } : null}
            />
          ) : baseQuestion === 'NONE' ? (
            // Not a question — but the line still says where the record is filed,
            // so hiding the choice never hides the outcome.
            <p className={pageStyles.implied}>
              {t('addStaff.branchImplied', { role: matchedRole, branch: options[0]?.name ?? '' })}
            </p>
          ) : baseQuestion === 'PREMISES' && options.length === 0 ? (
            <SetupNote
              icon={IoCubeOutline}
              text={t('addStaff.needsWarehouse', { role: matchedRole })}
              action={canAddBranch ? { label: t('addStaff.addWarehouse'), to: pathTo('addBranch') } : null}
            />
          ) : (
            <>
              {baseQuestion === 'PREMISES' ? <p className={fieldStyles.hint}>{t('addStaff.branchHomeHint')}</p> : null}
              <StaffBranchPicker
                name="add-staff-branch"
                legend={baseQuestion === 'ANY' ? t('addStaff.branchSection') : t('addStaff.branchHomeSection')}
                branches={options}
                value={branchId}
                onChange={setBranchId}
              />
            </>
          )}
        </Card>
      </Enter>

      {canSetPay ? (
        <Enter delay={step(3)}>
          <Card>
            <FormInput
              label={t('addStaff.baseSalary')}
              hint={t('addStaff.optional')}
              icon={IoCashOutline}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t('addStaff.baseSalaryPlaceholder')}
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              error={baseSalaryInvalid ? t('addStaff.invalidNumber') : null}
            />
          </Card>
        </Enter>
      ) : null}

      <Enter delay={step(4)} className={styles.submit}>
        {error ? <ErrorBanner key={error} message={error} /> : null}
        <PrimaryButton
          type="submit"
          block
          title={isSubmitting ? t('addStaff.submitting') : t('addStaff.submit')}
          icon={IoArrowForward}
          loading={isSubmitting}
          disabled={!canSubmit}
        />
      </Enter>
    </form>
  );
}
