import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { previewPayrollRun, runPayroll } from '@/api/payroll';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import { formatAmountPrecise } from '@/utils/format';
import { monthLabel } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import type { PayrollRunResult } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import StatTile from '@/components/StatTile';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

type Props = NativeStackScreenProps<AppStackParamList, 'PayrollRun'>;

/**
 * Generate every eligible payslip for a month in one go.
 *
 * Payroll used to be one HTTP call per person per month, driven from each
 * staff member's detail screen — unusable at the 50 employees the HRM quote
 * that prompted this work was priced for.
 *
 * Preview and run return the same shape from the server, so this renders one
 * component for both and the numbers you approve are the numbers you get.
 */
export default function PayrollRunScreen({ route, navigation }: Props) {
  const { month, year, branchId } = route.params;
  const { t } = useTranslation();
  const businessId = useBusinessId();

  const [preview, setPreview] = useState<PayrollRunResult | null>(null);
  const [result, setResult] = useState<PayrollRunResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = monthLabel(month, year, t);
  const shown = result ?? preview;

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setPreview(await previewPayrollRun(businessId, { month, year, branchId: branchId ?? undefined }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, month, year, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRun() {
    if (!businessId) return;
    haptics.tap();
    setIsRunning(true);
    setError(null);
    try {
      const run = await runPayroll(businessId, { month, year, branchId: branchId ?? undefined });
      setResult(run);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {t('payrollRun.title')}
          </Text>
          <PressableScale testID="payroll-run-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.monthLabel}>{label}</Text>
          </AnimatedEntrance>

          {error ? (
            <AnimatedEntrance key={error} delay={0} distance={-8} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {isLoading ? (
            <Text style={styles.emptyText}>{t('common.loading')}</Text>
          ) : shown ? (
            <>
              {shown.monthInProgress ? (
                <AnimatedEntrance delay={step(1)} style={styles.block}>
                  <View style={styles.noticeBanner}>
                    <Ionicons name="time-outline" size={16} color={colors.warning} />
                    <Text style={styles.noticeText}>{t('payrollRun.monthInProgress')}</Text>
                  </View>
                </AnimatedEntrance>
              ) : null}

              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.statRow}>
                  <StatTile
                    label={t('payrollRun.totalGross')}
                    value={Number(shown.totals.grossPay)}
                    formatValue={(v) => formatAmountPrecise(v, shown.totals.currency ?? 'INR')}
                  />
                  <StatTile
                    label={t('payrollRun.totalDeductions')}
                    value={Number(shown.totals.deductions)}
                    formatValue={(v) => formatAmountPrecise(v, shown.totals.currency ?? 'INR')}
                  />
                  <StatTile
                    label={t('payrollRun.totalNet')}
                    value={Number(shown.totals.netPay)}
                    accent={colors.primary}
                    formatValue={(v) => formatAmountPrecise(v, shown.totals.currency ?? 'INR')}
                  />
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>
                    {result ? t('payrollRun.done', { count: result.generated }) : t('payrollRun.ready', { count: shown.ready })}
                  </Text>
                  {shown.slips.length === 0 ? (
                    <Text style={styles.emptyText}>{t('payrollRun.nothingToRun')}</Text>
                  ) : (
                    shown.slips.map((slip, index) => (
                      <View key={slip.staffMemberId} style={[styles.row, index > 0 && styles.divided]}>
                        <View style={styles.rowText}>
                          <Text style={styles.name}>{slip.name ?? slip.staffMember?.name}</Text>
                          <Text style={styles.meta}>
                            {formatAmountPrecise(slip.grossPay, slip.currency)} −{' '}
                            {formatAmountPrecise(slip.deductions, slip.currency)}
                          </Text>
                        </View>
                        <Text style={styles.net}>{formatAmountPrecise(slip.netPay, slip.currency)}</Text>
                      </View>
                    ))
                  )}
                </View>
              </AnimatedEntrance>

              {shown.skipped.length > 0 ? (
                <AnimatedEntrance delay={step(4)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('payrollRun.skipped', { count: shown.skipped.length })}</Text>
                    {shown.skipped.map((skip, index) => (
                      <View key={skip.staffMemberId} style={[styles.row, index > 0 && styles.divided]}>
                        <Text style={styles.rowText}>{skip.name}</Text>
                        {/* The server sends a machine code; the label is ours. */}
                        <Pill label={t(`payrollRun.reason.${skip.reason}` as 'payrollRun.reason.NO_BASE_SALARY')} tone="muted" />
                      </View>
                    ))}
                  </View>
                </AnimatedEntrance>
              ) : null}

              {!result && shown.ready > 0 ? (
                <AnimatedEntrance delay={step(5)} style={styles.block}>
                  <PrimaryButton
                    testID="payroll-run-submit"
                    title={isRunning ? t('payrollRun.running') : t('payrollRun.run', { count: shown.ready })}
                    icon="document-text-outline"
                    loading={isRunning}
                    onPress={handleRun}
                  />
                </AnimatedEntrance>
              ) : null}
            </>
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
  monthLabel: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  block: { marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  divided: { borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  rowText: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  net: { fontSize: 14.5, fontWeight: '800', color: colors.primary },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FEF3C7',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  noticeText: { color: '#92400E', fontSize: 12.5, flex: 1 },
});
