import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { getStaffMember, setStaffActive, updateStaffMember } from '@/api/staff';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { can } from '@/utils/permissions';
import { parseOptionalNumber } from '@/utils/validation';
import { dateKeyFromApi } from '@/utils/date';
import type { StaffMember } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import DateField from '@/components/DateField';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'EditStaff'>;

/**
 * Edit a staff member.
 *
 * There was no way to change anything about a staff member after creation — a
 * raise, a branch transfer, a correction to a misspelled name or a departure
 * all required going into the database by hand.
 *
 * Deactivate rather than delete: attendance rows and past payslips are records
 * of things that happened and must survive.
 */
export default function EditStaffScreen({ route, navigation }: Props) {
  const { staffMemberId } = route.params;
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { branches } = useBranches();

  const canEditPay = can.managePayroll(membership);

  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
    if (!businessId) return;
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  }, [businessId, staffMemberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const salaryParsed = parseOptionalNumber(baseSalary);
  const salaryInvalid = salaryParsed === null;
  const canSubmit = !!businessId && !!name.trim() && !!role.trim() && !salaryInvalid && !isSaving;

  async function handleSave() {
    if (!businessId || !canSubmit) return;
    haptics.tap();
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
        // Omitted entirely for a MANAGER: the server 403s anyone who sends it
        // without permission, so don't send a value they can't change.
        ...(canEditPay ? { baseSalary: salaryParsed ?? undefined } : {}),
      });
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  function handleToggleActive() {
    if (!businessId || !staffMember) return;
    const deactivating = staffMember.status === 'ACTIVE';

    const run = async () => {
      try {
        await setStaffActive(businessId, staffMemberId, !deactivating);
        haptics.success();
        navigation.goBack();
      } catch (err) {
        haptics.error();
        setError(extractErrorMessage(err));
      }
    };

    if (!deactivating) {
      void run();
      return;
    }
    // Confirm the destructive direction only.
    Alert.alert(t('editStaff.deactivateTitle'), t('editStaff.deactivateBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('editStaff.deactivate'), style: 'destructive', onPress: () => void run() },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {t('editStaff.title')}
          </Text>
          <PressableScale testID="edit-staff-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error ? (
              <AnimatedEntrance key={error} delay={0} distance={-8}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {isLoading ? (
              <Text style={styles.emptyText}>{t('common.loading')}</Text>
            ) : (
              <>
                <AnimatedEntrance delay={step(0)}>
                  <FormInput
                    testID="edit-staff-name"
                    label={t('addStaff.name')}
                    icon="person-outline"
                    value={name}
                    onChangeText={setName}
                  />
                  <FormInput
                    testID="edit-staff-role"
                    label={t('addStaff.role')}
                    icon="briefcase-outline"
                    value={role}
                    onChangeText={setRole}
                  />
                  <FormInput
                    testID="edit-staff-phone"
                    label={t('editStaff.phone')}
                    hint={t('addStaff.optional')}
                    icon="call-outline"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                  <FormInput
                    testID="edit-staff-code"
                    label={t('editStaff.employeeCode')}
                    hint={t('addStaff.optional')}
                    icon="pricetag-outline"
                    value={employeeCode}
                    onChangeText={setEmployeeCode}
                  />
                </AnimatedEntrance>

                <AnimatedEntrance delay={step(1)}>
                  <DateField
                    testID="edit-staff-hired-on"
                    label={t('editStaff.hiredOn')}
                    hint={t('addStaff.optional')}
                    value={hiredOn}
                    onChange={setHiredOn}
                  />
                </AnimatedEntrance>

                {canEditPay ? (
                  <AnimatedEntrance delay={step(2)}>
                    <FormInput
                      testID="edit-staff-salary"
                      label={t('addStaff.baseSalary')}
                      hint={business?.defaultCurrency ?? 'INR'}
                      icon="cash-outline"
                      keyboardType="numeric"
                      value={baseSalary}
                      onChangeText={setBaseSalary}
                    />
                    {salaryInvalid ? <Text style={styles.fieldError}>{t('addStaff.invalidNumber')}</Text> : null}
                  </AnimatedEntrance>
                ) : (
                  <AnimatedEntrance delay={step(2)}>
                    <Text style={styles.hint}>{t('editStaff.salaryOwnerOnly')}</Text>
                  </AnimatedEntrance>
                )}

                <AnimatedEntrance delay={step(3)} style={styles.block}>
                  <Text style={styles.sectionTitle}>{t('editStaff.branch')}</Text>
                  <View style={styles.grid}>
                    {branches.map((branch) => (
                      <View key={branch.id} style={styles.gridItem}>
                        <SegmentedOption
                          testID={`edit-staff-branch-${branch.code}`}
                          title={branch.name}
                          caption={branch.code}
                          selected={branchId === branch.id}
                          onPress={() => setBranchId(branch.id)}
                        />
                      </View>
                    ))}
                  </View>
                </AnimatedEntrance>

                <AnimatedEntrance delay={step(4)} style={styles.block}>
                  <FormInput
                    testID="edit-staff-notes"
                    label={t('editStaff.notes')}
                    hint={t('addStaff.optional')}
                    icon="document-text-outline"
                    multiline
                    value={notes}
                    onChangeText={setNotes}
                  />
                </AnimatedEntrance>

                <AnimatedEntrance delay={step(5)} style={styles.block}>
                  <PrimaryButton
                    testID="edit-staff-submit"
                    title={isSaving ? t('editStaff.saving') : t('editStaff.save')}
                    icon="checkmark"
                    loading={isSaving}
                    disabled={!canSubmit}
                    onPress={handleSave}
                  />
                </AnimatedEntrance>

                <AnimatedEntrance delay={step(6)} style={styles.block}>
                  <PressableScale
                    testID="edit-staff-toggle-active"
                    style={styles.dangerButton}
                    onPress={handleToggleActive}
                  >
                    <Ionicons
                      name={staffMember?.status === 'ACTIVE' ? 'person-remove-outline' : 'person-add-outline'}
                      size={17}
                      color={staffMember?.status === 'ACTIVE' ? colors.error : colors.success}
                    />
                    <Text
                      style={[
                        styles.dangerText,
                        staffMember?.status !== 'ACTIVE' && { color: colors.success },
                      ]}
                    >
                      {staffMember?.status === 'ACTIVE' ? t('editStaff.deactivate') : t('editStaff.reactivate')}
                    </Text>
                  </PressableScale>
                </AnimatedEntrance>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4, flex: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.md },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48%' },
  hint: { fontSize: 12.5, color: colors.textTertiary, marginBottom: spacing.lg },
  fieldError: { color: colors.error, fontSize: 12, marginTop: -spacing.md, marginBottom: spacing.md },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.xl },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  dangerText: { color: colors.error, fontSize: 15, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
