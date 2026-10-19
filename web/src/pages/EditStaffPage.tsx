import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  IoBriefcaseOutline,
  IoCallOutline,
  IoCashOutline,
  IoCheckmark,
  IoDocumentTextOutline,
  IoPersonAddOutline,
  IoPersonOutline,
  IoPersonRemoveOutline,
  IoPricetagOutline,
} from 'react-icons/io5';
import { staffBase } from '@shared/permissions/staffBase';
import { extractErrorMessage } from '@/api/client';
import { getStaffMember, setStaffActive, updateStaffMember } from '@/api/staff';
import StaffBranchPicker from '@/components/staff/StaffBranchPicker';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DateField from '@/components/ui/DateField';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import FormTextArea from '@/components/ui/FormTextArea';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { useTeam } from '@/hooks/useTeam';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { refreshMyStaff } from '@/store/myStaffStore';
import { step } from '@/theme/motion';
import type { StaffMember } from '@/types/staffing';
import { confirm } from '@/utils/confirm';
import { dateKeyFromApi } from '@/utils/date';
import { hasCapability } from '@/utils/permissions';
import { parseOptionalNumber } from '@/utils/validation';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import styles from './FormPage.module.css';
import pageStyles from './StaffForm.module.css';

/**
 * Edit a staff member — the app's Edit staff screen: a raise, a move, a corrected
 * name, a departure. Deactivate rather than delete, because attendance and past
 * payslips are records of what happened; only that direction asks first.
 *
 * Pay needs `staff:setPay`, not `payroll:run` — a cashier holds the first and not
 * the second — and the key is left out of the request for anyone without it, or
 * the server refuses the whole save.
 */
export default function EditStaffPage() {
  const { staffMemberId = '' } = useParams();
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const currency = useAuthStore((s) => s.business?.defaultCurrency) ?? 'INR';
  const { branches, warehouseBranches } = useBranches();
  const { members: team } = useTeam();
  const detailPath = pathTo('staffDetail', { staffMemberId });
  const goBack = useGoBack(detailPath);
  const canEditPay = hasCapability(membership, 'staff:setPay');

  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [branchId, setBranchId] = useState('');
  const [hiredOn, setHiredOn] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !staffMemberId) return;
    try {
      const member = await getStaffMember(businessId, staffMemberId);
      setStaffMember(member);
      setName(member.name);
      setRole(member.role);
      setPhone(member.phone ?? '');
      setEmployeeCode(member.employeeCode ?? '');
      setBaseSalary(member.baseSalary ?? '');
      setBranchId(member.branchId);
      setHiredOn(member.hiredOn ? dateKeyFromApi(member.hiredOn) : '');
      setNotes(member.notes ?? '');
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, staffMemberId]);

  useEffect(() => {
    void load();
  }, [load]);

  // What the person's role implies about where they can be based — the rule Add
  // staff applies, held here too so it holds on the way back as well as in.
  const matched = useMemo(
    () =>
      staffMember?.userId ? (team.find((m) => m.user.id === staffMember.userId && m.status === 'ACTIVE') ?? null) : null,
    [team, staffMember]
  );

  /**
   * Only the `PREMISES` rule, as in the app: the warehouse desk is based where the
   * goods are, and the server refuses a shop anyway. Everyone else keeps every
   * location — this page exists to change what was set, so moving an admin's or
   * an agent's base has to be possible somewhere.
   */
  const options = useMemo(
    () => (staffBase(matched?.role) === 'PREMISES' ? warehouseBranches : branches),
    [matched, branches, warehouseBranches]
  );

  // A stored base that is no longer a valid answer is cleared rather than sent
  // back with an unrelated change.
  useEffect(() => {
    if (branchId && options.length && !options.some((b) => b.id === branchId)) setBranchId('');
  }, [branchId, options]);

  const salaryParsed = parseOptionalNumber(baseSalary);
  const salaryInvalid = salaryParsed === null;
  const canSubmit = !!businessId && !!name.trim() && !!role.trim() && !!branchId && !salaryInvalid && !isSaving;

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !canSubmit) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateStaffMember(businessId, staffMemberId, {
        name: name.trim(),
        role: role.trim(),
        phone: phone.trim() || undefined,
        employeeCode: employeeCode.trim() || undefined,
        branchId,
        hiredOn: hiredOn || undefined,
        notes: notes.trim() || undefined,
        ...(canEditPay ? { baseSalary: salaryParsed ?? undefined } : {}),
      });
      void refreshMyStaff();
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!businessId || !staffMember) return;
    const deactivating = staffMember.status === 'ACTIVE';
    // Only the destructive direction asks.
    if (deactivating) {
      const ok = await confirm({
        title: t('editStaff.deactivateTitle'),
        body: t('editStaff.deactivateBody'),
        confirmLabel: t('editStaff.deactivate'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    setIsToggling(true);
    setError(null);
    try {
      await setStaffActive(businessId, staffMemberId, !deactivating);
      void refreshMyStaff();
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsToggling(false);
    }
  }

  const active = staffMember?.status === 'ACTIVE';

  return (
    <form className={styles.page} onSubmit={handleSave} noValidate>
      <PageHeader title={t('editStaff.title')} backTo={detailPath} />

      {!staffMember ? (
        error ? (
          <ErrorBanner key={error} message={error} />
        ) : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )
      ) : (
        <>
          <Enter delay={step(1)}>
            <Card>
              <FormInput
                label={t('addStaff.name')}
                icon={IoPersonOutline}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <FormInput
                label={t('addStaff.role')}
                icon={IoBriefcaseOutline}
                autoComplete="off"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
              <div className={fieldStyles.pair}>
                <FormInput
                  label={t('editStaff.phone')}
                  hint={t('addStaff.optional')}
                  icon={IoCallOutline}
                  type="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <FormInput
                  label={t('editStaff.employeeCode')}
                  hint={t('addStaff.optional')}
                  icon={IoPricetagOutline}
                  autoComplete="off"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                />
              </div>
              <DateField
                label={t('editStaff.hiredOn')}
                hint={t('addStaff.optional')}
                value={hiredOn}
                onChange={setHiredOn}
              />
              {canEditPay ? (
                <FormInput
                  label={t('addStaff.baseSalary')}
                  hint={currency}
                  icon={IoCashOutline}
                  inputMode="decimal"
                  autoComplete="off"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  error={salaryInvalid ? t('addStaff.invalidNumber') : null}
                />
              ) : (
                <p className={pageStyles.readOnlyNote}>{t('editStaff.salaryOwnerOnly')}</p>
              )}
              <FormTextArea
                label={t('editStaff.notes')}
                hint={t('addStaff.optional')}
                icon={IoDocumentTextOutline}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Card>
          </Enter>

          <Enter delay={step(2)}>
            <Card title={t('editStaff.branch')}>
              {options.length === 0 ? (
                // A warehouse desk with no warehouse to be based at: say what is
                // missing instead of listing shops.
                <p className={pageStyles.implied}>
                  {t('addStaff.needsWarehouse', { role: t(`role.${matched?.role ?? 'STAFF'}`) })}
                </p>
              ) : (
                <StaffBranchPicker
                  name="edit-staff-branch"
                  legend={t('editStaff.branch')}
                  branches={options}
                  value={branchId || null}
                  onChange={setBranchId}
                />
              )}
            </Card>
          </Enter>

          <Enter delay={step(3)} className={styles.submit}>
            {error ? <ErrorBanner key={error} message={error} /> : null}
            <PrimaryButton
              type="submit"
              block
              title={isSaving ? t('editStaff.saving') : t('editStaff.save')}
              icon={IoCheckmark}
              loading={isSaving}
              disabled={!canSubmit}
            />
            {/* Leaving the roster is the app's red outline; coming back is not a warning. */}
            <Button
              block
              variant={active ? 'danger' : 'secondary'}
              title={active ? t('editStaff.deactivate') : t('editStaff.reactivate')}
              icon={active ? IoPersonRemoveOutline : IoPersonAddOutline}
              className={active ? undefined : pageStyles.restore}
              loading={isToggling}
              onClick={() => void handleToggleActive()}
            />
          </Enter>
        </>
      )}
    </form>
  );
}
