import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Picker from '@/components/Picker';
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
 *
 * A dropdown rather than a stack of rows, for the reason the language setting
 * is one: this is a setting touched rarely, and the list grows with the person
 * rather than with the product — somebody who runs a group of companies ends up
 * scrolling Settings to change which one they are looking at. `searchFrom={1}`
 * keeps the field whatever the count; `Picker` adds the box to type in by itself
 * once there are enough of them to need it.
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
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>{t('businessSwitcher.title')}</Text>
        {/* Switching refetches the whole business, so it has to say it is busy
            somewhere. Beside the heading, since the field itself is closed. */}
        {pendingId ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      <Text style={styles.hint}>{t('businessSwitcher.hint')}</Text>

      <Picker
        testIDPrefix="business"
        label={t('businessSwitcher.title')}
        hideLabel
        icon="business-outline"
        searchFrom={1}
        disabled={isSwitching}
        value={activeBusinessId}
        onChange={(businessId) => void select(businessId)}
        options={memberships.map((membership) => ({
          value: membership.businessId,
          label: membership.business.name,
          description: t(`role.${membership.role}`),
        }))}
      />

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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hint: { fontSize: 12.5, color: colors.textTertiary, marginBottom: spacing.sm, lineHeight: 17 },
  error: { fontSize: 12.5, color: colors.error, marginTop: spacing.sm },
});
