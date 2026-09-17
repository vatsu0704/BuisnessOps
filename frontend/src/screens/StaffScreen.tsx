import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { listStaffMembers } from '@/api/staff';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import type { StaffMember } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';

type Props = NativeStackScreenProps<AppStackParamList, 'Staff'>;

export default function StaffScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);
  const { branches } = useBranches();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setStaff(await listStaffMembers(businessId));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const branchName = (branchId: string) => branches.find((b) => b.id === branchId)?.name ?? branchId;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('staff.title')}</Text>
          <PressableScale testID="staff-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <InfoCard
              testID="staff-add"
              icon="person-add-outline"
              title={t('staff.add')}
              subtitle={t('staff.addSubtitle')}
              onPress={() => navigation.navigate('AddStaff')}
            />
          </AnimatedEntrance>

          {error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {!isLoading && staff.length === 0 && !error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <Text style={styles.emptyText}>{t('staff.empty')}</Text>
            </AnimatedEntrance>
          ) : null}

          {staff.map((member, index) => (
            <AnimatedEntrance key={member.id} delay={step(Math.min(index + 1, 5))} style={styles.block}>
              <PressableScale
                testID={`staff-row-${member.id}`}
                onPress={() => navigation.navigate('StaffDetail', { staffMemberId: member.id })}
                scaleTo={0.98}
              >
                <View style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.name}>{member.name}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                  </View>
                  <Text style={styles.meta}>
                    {member.role} · {branchName(member.branchId)}
                  </Text>
                  <View style={styles.pillRow}>
                    {member.userId ? <Pill label={t('staff.appAccess')} icon="phone-portrait-outline" /> : null}
                    {member.baseSalary ? (
                      <Pill label={t('staff.hasSalary')} icon="cash-outline" tone="muted" />
                    ) : null}
                  </View>
                </View>
              </PressableScale>
            </AnimatedEntrance>
          ))}
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
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  pillRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
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
