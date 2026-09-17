import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { getStaffAttendance, markAttendance } from '@/api/attendance';
import { getStaffMember } from '@/api/staff';
import { downloadSalarySlipPdf, generateSalarySlip, listStaffSalarySlips } from '@/api/payroll';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useMonthCursor } from '@/hooks/useMonthCursor';
import { formatAmount } from '@/utils/format';
import { parseOptionalNumber } from '@/utils/validation';
import type { AttendanceRecord, AttendanceStatus, SalarySlip, StaffMember } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import AttendanceStatusPill from '@/components/AttendanceStatusPill';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'StaffDetail'>;

const MARKABLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffDetailScreen({ route, navigation }: Props) {
  const { staffMemberId } = route.params;
  const { t } = useTranslation();
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);
  const business = useAuthStore((s) => s.business);
  const { branches } = useBranches();
  const { month, year, label, goPrev, goNext } = useMonthCursor();

  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [markDate, setMarkDate] = useState(todayISO());
  const [markStatus, setMarkStatus] = useState<AttendanceStatus>('ABSENT');
  const [isMarking, setIsMarking] = useState(false);

  const [deductions, setDeductions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadingSlipId, setDownloadingSlipId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [member, attendance, salarySlips] = await Promise.all([
        getStaffMember(businessId, staffMemberId),
        getStaffAttendance(businessId, staffMemberId, month, year),
        listStaffSalarySlips(businessId, staffMemberId),
      ]);
      setStaffMember(member);
      setRecords(attendance);
      setSlips(salarySlips);
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
    if (!businessId) return;
    haptics.tap();
    setIsMarking(true);
    setError(null);
    try {
      await markAttendance(businessId, staffMemberId, { date: markDate, status: markStatus });
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

  async function handleDownload(slip: SalarySlip) {
    if (!businessId) return;
    haptics.tap();
    setDownloadingSlipId(slip.id);
    setError(null);
    try {
      await downloadSalarySlipPdf(businessId, slip);
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setDownloadingSlipId(null);
    }
  }

  const branchName = staffMember ? branches.find((b) => b.id === staffMember.branchId)?.name : undefined;
  const deductionsParsed = parseOptionalNumber(deductions);
  const deductionsInvalid = deductionsParsed === null;
  const canGenerate = !!staffMember?.baseSalary && !deductionsInvalid && !isGenerating;

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
                <Text style={styles.meta}>{staffMember.role}</Text>
                <Text style={styles.meta}>{branchName ?? staffMember.branchId}</Text>
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
              <PressableScale testID="staff-detail-next-month" onPress={goNext} style={styles.monthNavButton}>
                <Ionicons name="chevron-forward" size={18} color={colors.text} />
              </PressableScale>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(2)} style={styles.block}>
            <View style={styles.card}>
              {isLoading ? (
                <Text style={styles.emptyText}>{t('common.loading')}</Text>
              ) : records.length === 0 ? (
                <Text style={styles.emptyText}>{t('attendance.noHistory')}</Text>
              ) : (
                records.map((record, index) => (
                  <View key={record.id} style={[styles.dayRow, index > 0 && styles.dayRowDivided]}>
                    <Text style={styles.dayDate}>{record.date.slice(0, 10)}</Text>
                    <AttendanceStatusPill status={record.status} />
                  </View>
                ))
              )}
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(3)} style={styles.block}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('staffDetail.markSection')}</Text>
              <FormInput
                testID="staff-detail-mark-date"
                label={t('staffDetail.date')}
                hint="YYYY-MM-DD"
                icon="calendar-outline"
                value={markDate}
                onChangeText={setMarkDate}
              />
              <View style={styles.chipRow}>
                {MARKABLE.map((s) => (
                  <SegmentedOption
                    key={s}
                    testID={`staff-detail-mark-${s}`}
                    title={t(`attendanceStatus.${s}`)}
                    selected={markStatus === s}
                    onPress={() => setMarkStatus(s)}
                  />
                ))}
              </View>
              <PrimaryButton
                testID="staff-detail-mark-submit"
                title={t('staffDetail.markSubmit')}
                loading={isMarking}
                onPress={handleMark}
                style={styles.markButton}
              />
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(4)} style={styles.block}>
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

          {slips.length > 0 ? (
            <AnimatedEntrance delay={step(5)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('staffDetail.pastSlips')}</Text>
                {slips.map((slip, index) => (
                  <View key={slip.id} style={[styles.slipRow, index > 0 && styles.dayRowDivided]}>
                    <View style={styles.slipText}>
                      <Text style={styles.dayDate}>{slip.monthYear}</Text>
                      <Text style={styles.meta}>{formatAmount(Number(slip.netPay), slip.currency)}</Text>
                    </View>
                    <PressableScale
                      testID={`staff-detail-download-${slip.id}`}
                      style={styles.downloadButton}
                      onPress={() => handleDownload(slip)}
                    >
                      {downloadingSlipId === slip.id ? (
                        <Text style={styles.downloadText}>…</Text>
                      ) : (
                        <Ionicons name="download-outline" size={16} color={colors.primary} />
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
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  dayRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  dayDate: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
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
