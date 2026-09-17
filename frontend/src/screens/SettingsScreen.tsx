import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import LanguageSelector from '@/components/LanguageSelector';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

const STAFF_MANAGING_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const TEAM_MANAGING_ROLES = new Set(['OWNER', 'ADMIN']);

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const logout = useAuthStore((s) => s.logout);
  const { stats } = useBranches();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  const membership = user?.memberships?.[0];
  const canManageStaff = !!membership && STAFF_MANAGING_ROLES.has(membership.role);
  const canManageTeam = !!membership && TEAM_MANAGING_ROLES.has(membership.role);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.screenTitle}>{t('settings.title')}</Text>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <LinearGradient
                  colors={['#6366F1', '#4338CA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, styles.avatarGradient]}
                />
                <Text style={styles.avatarText}>{initials(user?.name, user?.email)}</Text>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{user?.name ?? user?.email}</Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(2)} style={styles.block}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
              <Row label={t('settings.email')} value={user?.email ?? '—'} />
              {membership ? <Row label={t('settings.role')} value={t(`role.${membership.role}`)} /> : null}
            </View>
          </AnimatedEntrance>

          {business ? (
            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('settings.business')}</Text>
                <Row label={t('settings.name')} value={business.name} />
                <Row label={t('settings.industry')} value={t(`industry.${business.industry}`)} />
                <Row label={t('settings.branches')} value={String(stats.total)} />
                <Row label={t('settings.country')} value={business.country} />
                <Row label={t('settings.currency')} value={business.defaultCurrency} />
                <Row label={t('settings.timezone')} value={business.timezone} />
                <Row label={t('settings.businessId')} value={business.id} mono />
              </View>
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(4)} style={styles.block}>
            <InfoCard
              testID="settings-open-attendance"
              icon="finger-print-outline"
              title={t('settings.attendance')}
              subtitle={t('settings.attendanceSubtitle')}
              onPress={() => navigation.navigate('Attendance')}
            />
          </AnimatedEntrance>

          {canManageStaff ? (
            <AnimatedEntrance delay={step(5)} style={styles.block}>
              <InfoCard
                testID="settings-open-staff"
                icon="people-outline"
                title={t('settings.staff')}
                subtitle={t('settings.staffSubtitle')}
                onPress={() => navigation.navigate('Staff')}
              />
            </AnimatedEntrance>
          ) : null}

          {canManageTeam ? (
            <AnimatedEntrance delay={step(6)} style={styles.block}>
              <InfoCard
                testID="settings-open-team"
                icon="people-circle-outline"
                title={t('settings.team')}
                subtitle={t('settings.teamSubtitle')}
                onPress={() => navigation.navigate('Team')}
              />
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(7)} style={styles.block}>
            <LanguageSelector />
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(8)} style={styles.block}>
            <PressableScale testID="settings-logout" style={styles.logout} onPress={() => logout()}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={styles.logoutText}>{t('settings.logout')}</Text>
            </PressableScale>
          </AnimatedEntrance>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  screenTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  block: { marginTop: spacing.lg },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGradient: { borderRadius: radius.full },
  avatarText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  profileText: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '800', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: { fontSize: 13.5, color: colors.textSecondary },
  rowValue: { fontSize: 13.5, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
  rowValueMono: {
    fontSize: 11.5,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.surface,
  },
  logoutText: { color: colors.error, fontSize: 15, fontWeight: '700' },
});
