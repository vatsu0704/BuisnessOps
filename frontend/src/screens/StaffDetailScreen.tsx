import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { getStaffAttendance, markAttendance } from '@/api/attendance';
import { getStaffMember } from '@/api/staff';
import { generateSalarySlip, getStaffMonthSummary, listStaffSalarySlips, shareSalarySlip } from '@/api/payroll';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useMonthCursor } from '@/hooks/useMonthCursor';
import { formatAmount, formatAmountPrecise } from '@/utils/format';
import { parseOptionalNumber } from '@/utils/validation';
import type { AttendanceRecord, AttendanceStatus, MonthSummary, SalarySlip, StaffMember } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import AttendanceStatusPill from '@/components/AttendanceStatusPill';
import AttendanceStatusPicker from '@/components/AttendanceStatusPicker';
import PunchTrace from '@/components/PunchTrace';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import DateField from '@/components/DateField';
import MonthSummaryStrip from '@/components/MonthSummaryStrip';
import Pill from '@/components/Pill';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { can } from '@/utils/permissions';
import { dateKeyFromApi, formatDate, fromISODate, daysInMonth, todayISO } from '@/utils/date';

type Props = NativeStackScreenProps<AppStackParamList, 'StaffDetail'>;

export default function StaffDetailScreen({ route, navigation }: Props) {
  const { staffMemberId } = route.params;
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const business = useAuthStore((s) => s.business);
  const { branches } = useBranches();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();
  const membership = useMembership();
  const canManagePayroll = can.managePayroll(membership);

  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [markDate, setMarkDate] = useState(todayISO());
  // Starts unset rather than 'ABSENT'. A destructive default one tap away from
  // Save is how someone gets marked absent by accident.
  const [markStatus, setMarkStatus] = useState<AttendanceStatus | null>(null);
  const [isMarking, setIsMarking] = useState(false);

  const [deductions, setDeductions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sharingSlipId, setSharingSlipId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [member, attendance, salarySlips, monthSummary] = await Promise.all([
        getStaffMember(businessId, staffMemberId),
        getStaffAttendance(businessId, staffMemberId, month, year),
        listStaffSalarySlips(businessId, staffMemberId),
        getStaffMonthSummary(businessId, staffMemberId, month, year),
      ]);
      setStaffMember(member);
      setRecords(attendance);
      setSlips(salarySlips);
      setSummary(monthSummary);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, staffMemberId, month, year]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleMark() {
    if (!businessId || !markStatus) return;
    haptics.tap();
    setIsMarking(true);
    setError(null);
    try {
      await markAttendance(businessId, staffMemberId, { date: markDate, status: markStatus });
      setMarkStatus(null);
      haptics.success();
      await load();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsMarking(false);
    }
  }

  async function handleGenerate() {
    if (!businessId) return;
    haptics.tap();
    setIsGenerating(true);
    setError(null);
    try {
      await generateSalarySlip(businessId, staffMemberId, {
        month,
        year,
        deductions: deductionsParsed ?? undefined,
      });
      haptics.success();
      await load();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleShare(slip: SalarySlip) {
    if (!businessId) return;
    haptics.tap();
    setSharingSlipId(slip.id);
    setError(null);
    try {
      // Fetches the payslip as HTML in the app's current language and lets the
      // device print it to PDF — which is what makes the rupee sign and
      // Devanagari/Gujarati render at all.
      await shareSalarySlip(businessId, slip);
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setSharingSlipId(null);
    }
  }

  const branchName = staffMember ? branches.find((b) => b.id === staffMember.branchId)?.name : undefined;
  const deductionsParsed = parseOptionalNumber(deductions);
  const deductionsInvalid = deductionsParsed === null;
  const canGenerate = !!staffMember?.baseSalary && !deductionsInvalid && !isGenerating && canManagePayroll;

  // The mark-a-day field used to be entirely decoupled from the month cursor,
  // so you could be looking at March while writing into September — and the
  // list you refreshed afterwards would not contain what you just marked.
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(month, year)).padStart(2, '0')}`;
  const today = todayISO();
  const markMax = monthEnd < today ? monthEnd : today;
  useEffect(() => {
    // Clamp into the visible month: today when it falls inside, else the 1st.
    setMarkDate((current) =>
      current >= monthStart && current <= monthEnd ? current : today >= monthStart && today <= monthEnd ? today : monthStart
    );
  }, [monthStart, monthEnd, today]);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {staffMember?.name ?? t('staffDetail.title')}
          </Text>
          <PressableScale testID="staff-detail-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {error ? (
            <AnimatedEntrance key={error} delay={0} distance={-8}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {staffMember ? (
            <AnimatedEntrance delay={step(0)}>
              <View style={styles.card}>
                <View style={styles.identityHead}>
                  <View style={styles.identityText}>
                    <Text style={styles.meta}>{staffMember.role}</Text>
                    <Text style={styles.meta}>{branchName ?? staffMember.branchId}</Text>
                  </View>
                  {staffMember.status === 'INACTIVE' ? <Pill label={t('editStaff.inactive')} tone="muted" /> : null}
                  <PressableScale
                    testID="staff-detail-edit"
                    style={styles.iconButton}
                    onPress={() => navigation.navigate('EditStaff', { staffMemberId })}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.primary} />
                  </PressableScale>
                </View>
                {staffMember.baseSalary ? (
                  <Text style={styles.meta}>
                    {t('staffDetail.baseSalary', {
                      amount: formatAmount(Number(staffMember.baseSalary), business?.defaultCurrency ?? 'INR'),
                    })}
                  </Text>
                ) : (
                  <Text style={styles.metaWarn}>{t('staffDetail.noSalary')}</Text>
                )}
              </View>
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <View style={styles.monthNav}>
              <PressableScale testID="staff-detail-prev-month" onPress={goPrev} style={styles.monthNavButton}>
                <Ionicons name="chevron-back" size={18} color={colors.text} />
              </PressableScale>
              <Text style={styles.monthLabel}>{label}</Text>
              <PressableScale
                testID="staff-detail-next-month"
                onPress={goNext}
                disabled={!canGoNext}
                style={[styles.monthNavButton, !canGoNext && styles.monthNavDisabled]}
              >
                <Ionicons name="chevron-forward" size={18} color={canGoNext ? colors.text : colors.textTertiary} />
              </PressableScale>
            </View>
          </AnimatedEntrance>

          {summary ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('monthSummary.title')}</Text>
                <MonthSummaryStrip summary={summary} />
              </View>
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(3)} style={styles.block}>
            <View style={styles.card}>
              {isLoading ? (
                <Text style={styles.emptyText}>{t('common.loading')}</Text>
              ) : records.length === 0 ? (
                <Text style={styles.emptyText}>{t('attendance.noHistory')}</Text>
              ) : (
                records.map((record, index) => (
                  <View key={record.id} style={[styles.dayRow, index > 0 && styles.dayRowDivided]}>
                    <View style={styles.dayHead}>
                      <Text style={styles.dayDate}>{formatDate(dateKeyFromApi(record.date), t)}</Text>
                      <AttendanceStatusPill status={record.status} />
                    </View>
                    {/* When and where. Renders nothing for a day that was
                        marked by hand, so those rows stay as they were. */}
                    <PunchTrace record={record} />
                  </View>
                ))
              )}
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(4)} style={styles.block}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('staffDetail.markSection')}</Text>
              <DateField
                testID="staff-detail-mark-date"
                label={t('staffDetail.date')}
                value={markDate}
                onChange={setMarkDate}
                minimumDate={fromISODate(monthStart)}
                maximumDate={fromISODate(markMax)}
              />
              <AttendanceStatusPicker
                testIDPrefix="staff-detail-mark"
                label={t('staffDetail.status')}
                value={markStatus}
                onChange={setMarkStatus}
                style={styles.chipRow}
              />
              <PrimaryButton
                testID="staff-detail-mark-submit"
                title={t('staffDetail.markSubmit')}
                loading={isMarking}
                disabled={!markStatus}
                onPress={handleMark}
                style={styles.markButton}
              />
            </View>
          </AnimatedEntrance>

          {canManagePayroll ? (
          <AnimatedEntrance delay={step(5)} style={styles.block}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('staffDetail.payrollSection', { month: label })}</Text>
              {!staffMember?.baseSalary ? <Text style={styles.metaWarn}>{t('staffDetail.noSalaryHint')}</Text> : null}
              <FormInput
                testID="staff-detail-deductions"
                label={t('staffDetail.deductions')}
                hint={t('addStaff.optional')}
                icon="remove-circle-outline"
                keyboardType="numeric"
                value={deductions}
                onChangeText={setDeductions}
              />
              {deductionsInvalid ? <Text style={styles.fieldError}>{t('staffDetail.invalidNumber')}</Text> : null}
              <PrimaryButton
                testID="staff-detail-generate-slip"
                title={t('staffDetail.generateSlip')}
                icon="document-text-outline"
                loading={isGenerating}
                disabled={!canGenerate}
                onPress={handleGenerate}
                style={styles.markButton}
              />
            </View>
          </AnimatedEntrance>
          ) : null}

          {slips.length > 0 ? (
            <AnimatedEntrance delay={step(6)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('staffDetail.pastSlips')}</Text>
                {slips.map((slip, index) => (
                  <View key={slip.id} style={[styles.slipRow, index > 0 && styles.dayRowDivided]}>
                    <View style={styles.slipText}>
                      <View style={styles.slipHead}>
                        <Text style={styles.dayDate}>{slip.monthYear}</Text>
                        <Pill
                          label={slip.status === 'FINALIZED' ? t('staffDetail.finalized') : t('staffDetail.draft')}
                          tone={slip.status === 'FINALIZED' ? 'brand' : 'muted'}
                        />
                      </View>
                      <Text style={styles.meta}>{formatAmountPrecise(slip.netPay, slip.currency)}</Text>
                    </View>
                    <PressableScale
                      testID={`staff-detail-share-${slip.id}`}
                      style={styles.downloadButton}
                      onPress={() => handleShare(slip)}
                    >
                      {sharingSlipId === slip.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="share-outline" size={16} color={colors.primary} />
                      )}
                    </PressableScale>
                  </View>
                ))}
              </View>
            </AnimatedEntrance>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  identityHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  identityText: { flex: 1 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavDisabled: { opacity: 0.4 },
  slipHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4, flex: 1 },
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
  block: { marginTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  meta: { fontSize: 13.5, color: colors.textSecondary, marginTop: 2 },
  metaWarn: { fontSize: 12.5, color: colors.warning, marginTop: spacing.sm },
  fieldError: { fontSize: 12.5, color: colors.error, marginTop: -spacing.sm, marginBottom: spacing.md },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text, minWidth: 140, textAlign: 'center' },
  // A column now: the date and its status pill sit on one line, and the punch
  // trace goes underneath rather than competing with them for width.
  dayRow: { paddingVertical: spacing.md },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dayRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  dayDate: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
  chipRow: { marginBottom: spacing.lg },
  markButton: { marginTop: spacing.sm },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  slipText: { flex: 1 },
  downloadButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
