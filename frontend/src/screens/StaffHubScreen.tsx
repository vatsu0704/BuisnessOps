import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { getDailyRoster, markAttendance } from '@/api/attendance';
import { listStaffMembers } from '@/api/staff';
import { listSalarySlips, listStaffSalarySlips, shareSalarySlip } from '@/api/payroll';
import { extractErrorMessage } from '@/api/client';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useMonthCursor } from '@/hooks/useMonthCursor';
import { useMyStaffMember } from '@/hooks/useMyStaffMember';
import { can } from '@/utils/permissions';
import { formatAmountPrecise } from '@/utils/format';
import { todayISO } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import type { AttendanceStatus, DailyRoster, SalarySlip, StaffMember } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import AttendanceStatusPill from '@/components/AttendanceStatusPill';
import InfoCard from '@/components/InfoCard';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import StatTile from '@/components/StatTile';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

const MARKABLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

/**
 * The Staff tab.
 *
 * Replaces the empty Alerts placeholder (Phase 5, not started) so that
 * attendance and payroll — the parts of the app people actually use every day —
 * have a top-level home instead of sitting four taps deep under Settings.
 *
 * Role-aware rather than two screens: an owner or manager sees today's roster,
 * the staff list and payroll; everyone else sees their own attendance and
 * payslips. The backend enforces the same split, so a STAFF user who reached
 * the manager view anyway would get 403s rather than data.
 */
export default function StaffHubScreen() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { branches } = useBranches();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();
  const { staffMember: me, isStaff } = useMyStaffMember();

  const isManager = can.manageStaff(membership);
  const canRunPayroll = can.managePayroll(membership);

  const [branchId, setBranchId] = useState<string | null>(null);
  const [roster, setRoster] = useState<DailyRoster | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeBranchId = branchId ?? branches[0]?.id ?? null;
  const monthYear = `${year}-${String(month).padStart(2, '0')}`;

  const load = useCallback(async () => {
    if (!businessId) return;
    setError(null);
    try {
      if (isManager) {
        const [staffList, slipList] = await Promise.all([
          listStaffMembers(businessId),
          canRunPayroll ? listSalarySlips(businessId, { monthYear }) : Promise.resolve([]),
        ]);
        setStaff(staffList);
        setSlips(slipList);
        if (activeBranchId) {
          setRoster(await getDailyRoster(businessId, activeBranchId, todayISO()));
        }
      } else if (me) {
        setSlips(await listStaffSalarySlips(businessId, me.id));
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, isManager, canRunPayroll, activeBranchId, monthYear, me]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleQuickMark(staffMemberId: string, status: AttendanceStatus) {
    if (!businessId) return;
    haptics.tap();
    setMarkingId(null);
    try {
      // Correcting a day from the roster directly, rather than four taps into
      // the detail screen.
      await markAttendance(businessId, staffMemberId, { date: todayISO(), status });
      haptics.success();
      await load();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    }
  }

  async function handleShare(slip: SalarySlip) {
    if (!businessId) return;
    haptics.tap();
    setSharingId(slip.id);
    try {
      await shareSalarySlip(businessId, slip);
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setSharingId(null);
    }
  }

  const errorBanner = error ? (
    <AnimatedEntrance key={error} delay={0} distance={-8} style={styles.block}>
      <View style={styles.errorBanner}>
        <Ionicons name="alert-circle" size={16} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    </AnimatedEntrance>
  ) : null;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.title}>{t('staffHub.title')}</Text>
          </AnimatedEntrance>

          {errorBanner}

          {isManager ? (
            <>
              {branches.length > 1 ? (
                <AnimatedEntrance delay={step(1)} style={styles.block}>
                  <View style={styles.chipRow}>
                    {branches.map((branch) => (
                      <View key={branch.id} style={styles.chipItem}>
                        <SegmentedOption
                          testID={`staff-hub-branch-${branch.code}`}
                          title={branch.name}
                          selected={activeBranchId === branch.id}
                          onPress={() => setBranchId(branch.id)}
                        />
                      </View>
                    ))}
                  </View>
                </AnimatedEntrance>
              ) : null}

              {roster ? (
                <AnimatedEntrance delay={step(2)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('roster.title')}</Text>

                    {roster.isWeeklyOff ? (
                      <Text style={styles.calm}>{t('roster.weekOffDay')}</Text>
                    ) : roster.holiday ? (
                      <Text style={styles.calm}>{t('roster.holidayDay', { name: roster.holiday.name })}</Text>
                    ) : (
                      <View style={styles.statRow}>
                        <StatTile
                          label={t('roster.summaryPresent')}
                          value={roster.summary.present}
                          accent={colors.success}
                        />
                        <StatTile label={t('roster.summaryAbsent')} value={roster.summary.absent} accent={colors.error} />
                        <StatTile label={t('roster.summaryUnmarked')} value={roster.summary.unmarked} />
                      </View>
                    )}

                    {roster.entries.length === 0 ? (
                      <Text style={styles.emptyText}>{t('roster.noStaff')}</Text>
                    ) : (
                      roster.entries.map((entry, index) => (
                        <View key={entry.staffMember.id}>
                          <PressableScale
                            scaleTo={0.99}
                            testID={`roster-row-${entry.staffMember.id}`}
                            style={[styles.dayRow, index > 0 && styles.divided]}
                            onPress={() =>
                              setMarkingId(markingId === entry.staffMember.id ? null : entry.staffMember.id)
                            }
                          >
                            <View style={styles.rowText}>
                              <Text style={styles.name}>{entry.staffMember.name}</Text>
                              <Text style={styles.meta}>{entry.staffMember.role}</Text>
                            </View>
                            {entry.attendance ? (
                              <AttendanceStatusPill status={entry.attendance.status} />
                            ) : (
                              <Pill label={t('roster.unmarked')} tone="muted" />
                            )}
                          </PressableScale>

                          {markingId === entry.staffMember.id ? (
                            <View style={styles.markRow}>
                              {MARKABLE.map((status) => (
                                <View key={status} style={styles.markItem}>
                                  <SegmentedOption
                                    testID={`roster-mark-${entry.staffMember.id}-${status}`}
                                    title={t(`attendanceStatus.${status}`)}
                                    selected={entry.attendance?.status === status}
                                    onPress={() => handleQuickMark(entry.staffMember.id, status)}
                                  />
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                </AnimatedEntrance>
              ) : null}

              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <InfoCard
                  testID="staff-hub-add"
                  icon="person-add-outline"
                  title={t('staff.add')}
                  subtitle={t('staff.addSubtitle')}
                  onPress={() => navigation.navigate('AddStaff')}
                />
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(4)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('staffHub.staffSection')}</Text>
                  {staff.length === 0 ? (
                    <Text style={styles.emptyText}>{t('staff.empty')}</Text>
                  ) : (
                    staff.map((member, index) => (
                      <PressableScale
                        key={member.id}
                        scaleTo={0.99}
                        testID={`staff-hub-member-${member.id}`}
                        style={[styles.dayRow, index > 0 && styles.divided]}
                        onPress={() => navigation.navigate('StaffDetail', { staffMemberId: member.id })}
                      >
                        <View style={styles.rowText}>
                          <Text style={[styles.name, member.status === 'INACTIVE' && styles.nameInactive]}>
                            {member.name}
                          </Text>
                          <Text style={styles.meta}>
                            {member.role} · {branches.find((b) => b.id === member.branchId)?.name ?? ''}
                          </Text>
                        </View>
                        {member.status === 'INACTIVE' ? <Pill label={t('editStaff.inactive')} tone="muted" /> : null}
                        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                      </PressableScale>
                    ))
                  )}
                </View>
              </AnimatedEntrance>

              {canRunPayroll ? (
                <AnimatedEntrance delay={step(5)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('staffHub.payrollSection')}</Text>

                    <View style={styles.monthNav}>
                      <PressableScale testID="staff-hub-prev-month" onPress={goPrev} style={styles.monthNavButton}>
                        <Ionicons name="chevron-back" size={18} color={colors.text} />
                      </PressableScale>
                      <Text style={styles.monthLabel}>{label}</Text>
                      <PressableScale
                        testID="staff-hub-next-month"
                        onPress={goNext}
                        disabled={!canGoNext}
                        style={[styles.monthNavButton, !canGoNext && styles.disabled]}
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={canGoNext ? colors.text : colors.textTertiary}
                        />
                      </PressableScale>
                    </View>

                    {slips.length === 0 ? (
                      <Text style={styles.emptyText}>{t('staffHub.noSlips')}</Text>
                    ) : (
                      slips.map((slip, index) => (
                        <View key={slip.id} style={[styles.dayRow, index > 0 && styles.divided]}>
                          <View style={styles.rowText}>
                            <Text style={styles.name}>{slip.staffMember?.name ?? slip.monthYear}</Text>
                            <Text style={styles.meta}>{formatAmountPrecise(slip.netPay, slip.currency)}</Text>
                          </View>
                          <PressableScale
                            testID={`staff-hub-share-${slip.id}`}
                            style={styles.iconButton}
                            onPress={() => handleShare(slip)}
                          >
                            <Ionicons
                              name={sharingId === slip.id ? 'hourglass-outline' : 'share-outline'}
                              size={16}
                              color={colors.primary}
                            />
                          </PressableScale>
                        </View>
                      ))
                    )}

                    <PressableScale
                      testID="staff-hub-run-payroll"
                      style={styles.runButton}
                      onPress={() => navigation.navigate('PayrollRun', { month, year, branchId: activeBranchId })}
                    >
                      <Ionicons name="play-circle-outline" size={18} color={colors.primary} />
                      <Text style={styles.runText}>{t('staffHub.runPayroll', { month: label })}</Text>
                    </PressableScale>
                  </View>
                </AnimatedEntrance>
              ) : null}
            </>
          ) : (
            <>
              {!isStaff ? (
                <AnimatedEntrance delay={step(1)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.emptyText}>{t('staffHub.notStaff')}</Text>
                  </View>
                </AnimatedEntrance>
              ) : (
                <>
                  <AnimatedEntrance delay={step(1)} style={styles.block}>
                    <InfoCard
                      testID="staff-hub-my-attendance"
                      icon="finger-print-outline"
                      title={t('staffHub.mySection')}
                      subtitle={t('settings.attendanceSubtitle')}
                      onPress={() => navigation.navigate('Attendance')}
                    />
                  </AnimatedEntrance>

                  <AnimatedEntrance delay={step(2)} style={styles.block}>
                    <View style={styles.card}>
                      <Text style={styles.sectionTitle}>{t('staffHub.mySlips')}</Text>
                      {slips.length === 0 ? (
                        <Text style={styles.emptyText}>{t('staffHub.noSlips')}</Text>
                      ) : (
                        slips.map((slip, index) => (
                          <View key={slip.id} style={[styles.dayRow, index > 0 && styles.divided]}>
                            <View style={styles.rowText}>
                              <Text style={styles.name}>{slip.monthYear}</Text>
                              <Text style={styles.meta}>{formatAmountPrecise(slip.netPay, slip.currency)}</Text>
                            </View>
                            <PressableScale
                              testID={`staff-hub-my-share-${slip.id}`}
                              style={styles.iconButton}
                              onPress={() => handleShare(slip)}
                            >
                              <Ionicons
                                name={sharingId === slip.id ? 'hourglass-outline' : 'share-outline'}
                                size={16}
                                color={colors.primary}
                              />
                            </PressableScale>
                          </View>
                        ))
                      )}
                    </View>
                  </AnimatedEntrance>
                </>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, paddingTop: spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  block: { marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipItem: { minWidth: '30%', flexGrow: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  divided: { borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  rowText: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  nameInactive: { color: colors.textTertiary },
  meta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  calm: { fontSize: 13, color: colors.textSecondary, paddingVertical: spacing.sm },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  markRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingBottom: spacing.sm },
  markItem: { minWidth: '22%', flexGrow: 1 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  disabled: { opacity: 0.4 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 46,
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.primaryLight,
  },
  runText: { color: colors.primary, fontSize: 14.5, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
