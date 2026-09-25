import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { getExpenseCompliance } from '@/api/expenses';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import { formatAmount } from '@/utils/format';
import PressableScale from '@/components/PressableScale';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import type { ExpenseCompliance } from '@/types/expense';

/**
 * "The person at the back office will call the branches that haven't logged
 * their daily expenses." — requirement 10's last line.
 *
 * A list rather than a link, because the action here is a phone call and the
 * only thing needed to make it is the branch's name. Tapping a row opens that
 * branch's figures, which is the second thing you want when the answer is "we
 * did log it".
 *
 * The figures come from the server and are computed when this card loads, in
 * **each branch's own local date** — a business with branches in two timezones
 * has no single "today", and the device's clock is not the answer for any of
 * them. That is the whole reason this cannot be worked out here from a list of
 * expenses.
 */

const MAX_ROWS = 6;

export default function ExpenseGapsCard() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  const [compliance, setCompliance] = useState<ExpenseCompliance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      setCompliance(await getExpenseCompliance(businessId));
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId]);

  // Home is a tab and never unmounts, so a plain effect would run once and
  // leave this card showing yesterday's answer for as long as the app lives.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!compliance && !error) return null;

  const missing = compliance?.branches.filter((row) => !row.hasLogged) ?? [];
  const shown = missing.slice(0, MAX_ROWS);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, missing.length === 0 && styles.iconCalm]}>
          <Ionicons
            name={missing.length === 0 ? 'checkmark-circle-outline' : 'call-outline'}
            size={18}
            color={missing.length === 0 ? colors.success : colors.warning}
          />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>{t('expenses.gapsTitle')}</Text>
          <Text style={styles.subtitle}>
            {missing.length === 0
              ? t('expenses.gapsAllDone')
              : t('expenses.gapsSubtitle', { count: missing.length })}
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {shown.map((row) => (
        <PressableScale
          key={row.branchId}
          testID={`expense-gap-${row.branchCode}`}
          scaleTo={0.98}
          style={styles.row}
          onPress={() => navigation.navigate('Expenses', { branchId: row.branchId })}
        >
          <Ionicons
            name={row.branchKind === 'WAREHOUSE' ? 'cube-outline' : 'storefront-outline'}
            size={15}
            color={colors.textTertiary}
          />
          <Text style={styles.branchName} numberOfLines={1}>
            {row.branchName}
          </Text>
          <Text style={styles.nothing}>{t('expenses.gapsNothing')}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </PressableScale>
      ))}

      {missing.length > shown.length ? (
        <Text style={styles.more}>+{missing.length - shown.length}</Text>
      ) : null}

      {/* What the branches that DID log spent, so the card is worth reading on
          a day when nobody needs calling. */}
      {missing.length === 0 && compliance
        ? compliance.branches.slice(0, MAX_ROWS).map((row) => (
            <PressableScale
              key={row.branchId}
              testID={`expense-logged-${row.branchCode}`}
              scaleTo={0.98}
              style={styles.row}
              onPress={() => navigation.navigate('Expenses', { branchId: row.branchId })}
            >
              <Ionicons
                name={row.branchKind === 'WAREHOUSE' ? 'cube-outline' : 'storefront-outline'}
                size={15}
                color={colors.textTertiary}
              />
              <Text style={styles.branchName} numberOfLines={1}>
                {row.branchName}
              </Text>
              <Text style={styles.logged}>
                {t('expenses.gapsLogged', { amount: formatAmount(Number(row.totalSpent), 'INR') })}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            </PressableScale>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
  },
  iconCalm: { backgroundColor: '#DCFCE7' },
  headText: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  branchName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
  nothing: { fontSize: 12, fontWeight: '700', color: colors.warning },
  logged: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  more: { ...typography.label, color: colors.textTertiary, paddingTop: spacing.sm },
  error: { fontSize: 12.5, color: colors.error, paddingTop: spacing.xs },
});
