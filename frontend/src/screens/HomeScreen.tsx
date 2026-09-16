import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { AppTabParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import BrandMark from '@/components/BrandMark';
import InfoCard from '@/components/InfoCard';
import PhaseNotice from '@/components/PhaseNotice';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import StatTile from '@/components/StatTile';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';

type Props = BottomTabScreenProps<AppTabParamList, 'Home'>;

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const { branches, isLoading, error, refresh, stats } = useBranches();

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? '';

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <BrandMark size={34} />
          <Text style={styles.wordmark}>BizIQ</Text>
          <View style={styles.topBarSpacer} />
          <View style={styles.branchChip}>
            <Ionicons name="git-branch-outline" size={13} color={colors.primary} />
            <Text style={styles.branchChipText}>
              {stats.total === 1 ? '1 branch' : `${stats.total} branches`}
            </Text>
          </View>
          <PressableScale
            testID="home-open-settings"
            style={styles.avatar}
            onPress={() => navigation.navigate('Settings')}
          >
            <LinearGradient
              colors={['#6366F1', '#4338CA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.avatarGradient]}
            />
            <Text style={styles.avatarText}>{initials(user?.name, user?.email)}</Text>
          </PressableScale>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.primary} />
          }
        >
          <AnimatedEntrance delay={step(0)} style={styles.greetingBlock}>
            <Text style={styles.greeting}>Hi {firstName}</Text>
            {business ? <Text style={styles.business}>{business.name}</Text> : null}
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)}>
            <View style={styles.statRow}>
              <StatTile label="Branches" value={stats.total} />
              <StatTile label="Active" value={stats.active} accent={colors.success} />
              <StatTile label="Cities" value={stats.cities} />
            </View>
          </AnimatedEntrance>

          {error ? (
            <AnimatedEntrance delay={step(2)}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {!error && stats.total === 0 ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <InfoCard
                icon="storefront-outline"
                title="No branches yet"
                subtitle="Add your first branch to start tracking sales, stock and staff per location."
              />
            </AnimatedEntrance>
          ) : null}

          {stats.total > 0 ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Your branches</Text>
                  <Pill label={`${stats.active} active`} />
                </View>
                {branches.slice(0, 5).map((branch, index) => (
                  <View key={branch.id} style={[styles.branchRow, index > 0 && styles.branchRowDivided]}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: branch.status === 'ACTIVE' ? colors.success : colors.textTertiary },
                      ]}
                    />
                    <View style={styles.branchText}>
                      <Text style={styles.branchName}>{branch.name}</Text>
                      <Text style={styles.branchMeta}>
                        {[branch.code, branch.city, branch.region].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))}
                {branches.length > 5 ? (
                  <Text style={styles.more}>+{branches.length - 5} more</Text>
                ) : null}
              </View>
            </AnimatedEntrance>
          ) : null}

          <AnimatedEntrance delay={step(3)} style={styles.block}>
            <PhaseNotice
              icon="sparkles-outline"
              badge="Next up"
              title="Ask your business anything"
              body="The query engine turns plain-language questions into answers computed from your own sales data, with the numbers behind every answer. It switches on once an AI provider is connected."
              examples={[
                'What were October sales versus last year?',
                'Which branch had the lowest sales last month, and why?',
                'Compare my Ahmedabad and Surat outlets this week.',
              ]}
            />
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(4)} style={styles.block}>
            <InfoCard
              icon="cloud-upload-outline"
              title="Bring your sales data in"
              subtitle="Upload sales history from CSV or Excel — the ingestion pipeline is already live."
            />
          </AnimatedEntrance>
        </ScrollView>

        <AnimatedEntrance delay={step(5)}>
          <View style={styles.askBar}>
            <View style={styles.askInput}>
              <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.textTertiary} />
              <Text style={styles.askPlaceholder}>Ask about sales, stock or branches…</Text>
            </View>
            <View style={styles.askSend}>
              <Ionicons name="arrow-up" size={18} color={colors.white} />
            </View>
          </View>
          <Text style={styles.askNote}>Available once the query engine is connected</Text>
        </AnimatedEntrance>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  wordmark: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  topBarSpacer: { flex: 1 },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
  },
  branchChipText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGradient: { borderRadius: radius.full },
  avatarText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  // flex:1 keeps the list scrollable instead of being clipped by the pinned ask bar
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  greetingBlock: { marginBottom: spacing.lg },
  greeting: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  business: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  block: { marginTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  branchRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  branchText: { flex: 1 },
  branchName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  branchMeta: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  more: { fontSize: 12.5, color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  askBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  askInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F2F2F6',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  askPlaceholder: { fontSize: 14, color: colors.textTertiary },
  askSend: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askNote: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
