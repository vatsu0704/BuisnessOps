import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useMembership } from '@/hooks/useBusinessId';
import { useToday } from '@/hooks/useToday';
import PressableScale from '@/components/PressableScale';
import {
  QUICK_ACTIONS,
  isQuickActionVisible,
  quickActionLabelKey,
  type QuickAction,
  type QuickActionRoute,
} from '@/constants/quickActions';
import { hasCapability } from '@/utils/permissions';
import { formatAmount } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { colors, gradient, radius, shadow, spacing } from '@/theme';

/** Every route a tile names is a real route — a renamed screen fails `tsc` here. */
type UnknownRoute = Exclude<QuickActionRoute, keyof AppStackParamList>;
const everyRouteExists: [UnknownRoute] extends [never] ? true : UnknownRoute = true;
void everyRouteExists;

const GAP = spacing.sm;
/**
 * The narrowest a tile may be and still hold its icon over a two-line label.
 * The column count is derived from it and the screen, never a fixed percentage:
 * three across on a common phone, two on a 320dp one, four on a tablet.
 */
const MIN_TILE_WIDTH = 96;
const MAX_COLUMNS = 4;

/**
 * Home's quick actions (requirement 33) — the grid a shop's phone opens on.
 *
 * The till leads, drawn large across the top with today's takings on it, because
 * billing is what most of the people opening this app came to do. The rest are
 * square tiles sized by the screen; their labels wrap rather than shrink or cut,
 * since every Indic translation runs longer than the English.
 */
export default function QuickActionsSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const membership = useMembership();
  const { today } = useToday();
  const { width } = useWindowDimensions();

  const actions = QUICK_ACTIONS.filter((action) =>
    isQuickActionVisible(action, (capability) => hasCapability(membership, capability))
  );
  if (actions.length === 0) return null;

  const primary = actions.find((action) => action.primary) ?? null;
  const tiles = actions.filter((action) => !action.primary);

  const available = width - spacing.xl * 2;
  const columns = Math.max(2, Math.min(MAX_COLUMNS, Math.floor((available + GAP) / (MIN_TILE_WIDTH + GAP))));
  const tileWidth = (available - GAP * (columns - 1)) / columns;

  function open(action: QuickAction) {
    haptics.tap();
    // The route is checked against the navigator above; the params are each
    // route's own. Navigating from a tab finds a tab of that name first — the
    // cashier's Counter tab — and the pushed screen otherwise.
    (navigation.navigate as (route: string, params?: object) => void)(action.route, action.params);
  }

  return (
    <View testID="home-quick-actions" style={styles.wrap}>
      <Text style={styles.title}>{t('quickActions.title')}</Text>

      {primary ? (
        <PressableScale testID={`home-quick-${primary.key}`} scaleTo={0.98} onPress={() => open(primary)}>
          <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
            <View style={styles.primaryIcon}>
              <Ionicons name={primary.icon as keyof typeof Ionicons.glyphMap} size={24} color={colors.white} />
            </View>
            <View style={styles.primaryText}>
              <Text style={styles.primaryLabel}>{t(quickActionLabelKey(primary.key))}</Text>
              {today ? (
                <Text style={styles.primaryCaption}>
                  {t('quickActions.billingToday', {
                    amount: formatAmount(Number(today.totals.sales), today.currency),
                    count: today.totals.saleCount,
                  })}
                </Text>
              ) : null}
            </View>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </LinearGradient>
        </PressableScale>
      ) : null}

      {tiles.length > 0 ? (
        <View style={styles.grid}>
          {tiles.map((action) => (
            <PressableScale
              key={action.key}
              testID={`home-quick-${action.key}`}
              scaleTo={0.96}
              style={[styles.tile, { width: tileWidth }]}
              onPress={() => open(action)}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.primary} />
              </View>
              <Text style={styles.tileLabel}>{t(quickActionLabelKey(action.key))}</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 72,
    ...shadow.md,
  },
  primaryIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceOnPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { flex: 1, gap: 2 },
  primaryLabel: { fontSize: 17, fontWeight: '800', color: colors.white },
  primaryCaption: { fontSize: 12.5, color: colors.textOnPrimaryMuted, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    minHeight: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center', lineHeight: 17 },
});
