import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableScale from '@/components/PressableScale';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { switchableMemberships } from '@/utils/permissions';
import { haptics } from '@/utils/haptics';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Choose which business the app acts under.
 *
 * Renders nothing for the common case of one business, so a single-business
 * owner never sees a control that has no alternative to offer. Before this,
 * someone in two businesses saw whichever one the API listed first, with no
 * way to reach the other.
 */
export default function BusinessSwitcher() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const switchBusiness = useAuthStore((s) => s.switchBusiness);
  const isSwitching = useAuthStore((s) => s.isSwitchingBusiness);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const memberships = switchableMemberships(user);
  if (memberships.length < 2) return null;

  const select = async (businessId: string) => {
    if (isSwitching || businessId === activeBusinessId) return;
    haptics.select();
    setPendingId(businessId);
    setError(null);
    try {
      await switchBusiness(businessId);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('businessSwitcher.title')}</Text>
      <Text style={styles.hint}>{t('businessSwitcher.hint')}</Text>

      {memberships.map((membership) => {
        const selected = membership.businessId === activeBusinessId;
        return (
          <PressableScale
            key={membership.id}
            testID={`business-option-${membership.businessId}`}
            style={[styles.row, selected && styles.rowSelected]}
            scaleTo={0.98}
            onPress={() => void select(membership.businessId)}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
                {membership.business.name}
              </Text>
              <Text style={styles.role}>{t(`role.${membership.role}`)}</Text>
            </View>
            {pendingId === membership.businessId ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : selected ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            ) : null}
          </PressableScale>
        );
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hint: { fontSize: 12.5, color: colors.textTertiary, marginBottom: spacing.sm, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rowText: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  labelSelected: { color: colors.primary },
  role: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  error: { fontSize: 12.5, color: colors.error, marginTop: spacing.sm },
});
