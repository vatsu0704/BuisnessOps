import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useScreenEdges } from '@/hooks/useScreenEdges';
import { extractErrorMessage } from '@/api/client';
import { listExpenseCategories, setExpenseCategoryCostType } from '@/api/expenses';
import type { ExpenseCategory, ExpenseCostType } from '@/types/expense';
import { categoryLabel } from '@/utils/expenseCategory';
import { hasCapability } from '@/utils/permissions';
import { haptics } from '@/utils/haptics';
import { colors, radius, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

const TYPES: { type: ExpenseCostType; icon: 'trending-up-outline' | 'lock-closed-outline' | 'cafe-outline' }[] = [
  { type: 'VARIABLE', icon: 'trending-up-outline' },
  { type: 'FIXED', icon: 'lock-closed-outline' },
  { type: 'DAILY', icon: 'cafe-outline' },
];

/**
 * How costs are grouped in Reports — requirement 34.
 *
 * Every expense category is variable, fixed or day-to-day, and Reports adds the
 * spending up that way. The seeded ones start where Vatsal put them; one somebody
 * typed starts as day-to-day. Two lines that are not categories are stated so the
 * reader is not left wondering: raw material is always variable, wages always
 * fixed.
 *
 * Reading it is `expense:view`; changing a category is `expense:classify` — the
 * cashier who logs the milk does not decide how the owner's report sorts it.
 * Changing one moves only the split; no total changes.
 */
export default function ExpenseCategoriesScreen() {
  const edges = useScreenEdges();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const businessId = useBusinessId();
  const canClassify = hasCapability(useMembership(), 'expense:classify');

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setCategories(await listExpenseCategories(businessId));
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

  async function choose(category: ExpenseCategory, costType: ExpenseCostType) {
    if (!businessId || category.costType === costType) return;
    setSaving(category.id);
    setError(null);
    // Shown at once and put back if the server refuses, so a row never sits on a
    // choice nobody made.
    setCategories((rows) => rows.map((row) => (row.id === category.id ? { ...row, costType } : row)));
    try {
      await setExpenseCategoryCostType(businessId, category.id, costType);
      haptics.tap();
    } catch (err) {
      setCategories((rows) => rows.map((row) => (row.id === category.id ? category : row)));
      setError(extractErrorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('costTypes.title')}</Text>
            <Text style={styles.subtitle}>{t('costTypes.subtitle')}</Text>
          </View>
          <PressableScale testID="cost-types-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void load()} tintColor={colors.primary} />}
        >
          <AnimatedEntrance delay={step(0)} style={styles.block}>
            <View style={styles.explainer}>
              {TYPES.map(({ type, icon }) => (
                <View key={type} style={styles.explainRow}>
                  <Ionicons name={icon} size={16} color={colors.primary} />
                  <Text style={styles.explainText}>
                    <Text style={styles.explainStrong}>{t(`costTypes.type.${type}`)}</Text>
                    {' — '}
                    {t(`costTypes.hint.${type}`)}
                  </Text>
                </View>
              ))}
            </View>
          </AnimatedEntrance>

          {error ? (
            <View style={[styles.block, styles.errorBanner]}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <AnimatedEntrance delay={step(1)} style={styles.block}>
            <Text style={styles.sectionTitle}>{t('costTypes.alwaysSection')}</Text>
            <View style={styles.fixedRow}>
              <Text style={styles.rowName}>{t('costTypes.rawMaterial')}</Text>
              <Text style={styles.rowType}>{t('costTypes.type.VARIABLE')}</Text>
            </View>
            <View style={styles.fixedRow}>
              <Text style={styles.rowName}>{t('costTypes.wages')}</Text>
              <Text style={styles.rowType}>{t('costTypes.type.FIXED')}</Text>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(2)} style={styles.block}>
            <Text style={styles.sectionTitle}>{t('costTypes.categoriesSection')}</Text>
            {!canClassify ? <Text style={styles.readOnly}>{t('costTypes.readOnly')}</Text> : null}
            <View style={styles.list}>
              {categories.map((category) => (
                <View key={category.id} style={styles.card}>
                  {/* The name above its choice, never beside it: three options
                      already fill a row, and a long category name beside them
                      is the row that breaks in Gujarati. */}
                  <Text style={styles.rowName}>{categoryLabel(category, t)}</Text>
                  {canClassify ? (
                    <View style={styles.segmented}>
                      {TYPES.map(({ type }) => (
                        <SegmentedOption
                          key={type}
                          testID={`cost-type-${category.id}-${type}`}
                          title={t(`costTypes.type.${type}`)}
                          selected={category.costType === type}
                          onPress={() => {
                            if (saving !== category.id) void choose(category, type);
                          }}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.rowType}>{t(`costTypes.type.${category.costType}`)}</Text>
                  )}
                </View>
              ))}
            </View>
          </AnimatedEntrance>
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
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flexShrink: 1, gap: 2 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
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
  explainer: { backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  explainText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  explainStrong: { fontWeight: '800' },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  readOnly: { fontSize: 12.5, color: colors.textTertiary, marginBottom: spacing.sm },
  fixedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowName: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  rowType: { fontSize: 13, fontWeight: '700', color: colors.primary },
  segmented: { flexDirection: 'row', gap: spacing.xs },
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
