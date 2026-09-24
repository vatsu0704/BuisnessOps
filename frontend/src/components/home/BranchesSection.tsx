import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBranches } from '@/hooks/useBranches';
import PressableScale from '@/components/PressableScale';
import { colors, radius, shadow, spacing } from '@/theme';

const PREVIEW_COUNT = 5;

/**
 * The branch list, lifted out of HomeScreen unchanged.
 *
 * Gated on `branch:update` by Home's section table, because its only
 * interaction is opening Branch settings — a list whose every row leads
 * somewhere the viewer cannot go is worse than no list.
 */
export default function BranchesSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { branches, stats } = useBranches();

  if (stats.total === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('home.branchesTitle')}</Text>
        <PressableScale
          testID="home-add-branch"
          style={styles.addBranch}
          onPress={() => navigation.navigate('AddBranch')}
        >
          <Ionicons name="add" size={15} color={colors.primary} />
          <Text style={styles.addBranchText}>{t('home.addBranch')}</Text>
        </PressableScale>
      </View>

      {branches.slice(0, PREVIEW_COUNT).map((branch, index) => (
        <PressableScale
          key={branch.id}
          testID={`home-branch-${branch.id}`}
          scaleTo={0.99}
          style={[styles.branchRow, index > 0 && styles.branchRowDivided]}
          onPress={() => navigation.navigate('BranchSettings', { branchId: branch.id })}
        >
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
          {/* Says out loud that a branch with no radius set enforces none,
              which is otherwise invisible until someone punches in from the
              wrong place. */}
          {branch.geofenceRadiusMeters !== null ? (
            <Ionicons name="location" size={14} color={colors.primary} />
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </PressableScale>
      ))}

      {branches.length > PREVIEW_COUNT ? (
        <Text style={styles.more}>{t('common.more', { count: branches.length - PREVIEW_COUNT })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  addBranch: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  addBranchText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  branchRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  statusDot: { width: 8, height: 8, borderRadius: radius.full },
  branchText: { flex: 1 },
  branchName: { fontSize: 14, fontWeight: '600', color: colors.text },
  branchMeta: { fontSize: 12, color: colors.textTertiary },
  more: { fontSize: 12.5, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xs },
});
