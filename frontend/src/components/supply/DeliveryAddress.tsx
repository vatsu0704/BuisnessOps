import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { colors, radius, spacing, typography } from '@/theme';
import type { SupplyDestination } from '@/types/supply';

/**
 * Where this order is going — what a delivery agent reads before setting off.
 *
 * The destination travels on the order itself rather than being fetched from a
 * branch endpoint, because the agent holds no capability to call one: their
 * order screen is the only place they open.
 *
 * Shown to everyone who can see the order, not only the agent. For the branch
 * that placed it, it is the one place the address they will be delivered to is
 * visible at all, which is how a wrong one gets noticed before a rider does.
 */

/**
 * Coordinates when the branch has them, the written address otherwise.
 *
 * Both go to the same documented `?api=1&query=` form, so the device offers
 * whichever map app it actually has. The https URL rather than a `geo:` URI
 * because it resolves everywhere — no `canOpenURL` dance, and no silent no-op
 * on a device with nothing registered for the scheme.
 */
function mapQuery(branch: SupplyDestination, written: string): string | null {
  if (branch.latitude !== null && branch.longitude !== null) {
    return `${branch.latitude},${branch.longitude}`;
  }
  return written ? `${branch.name}, ${written}` : null;
}

export default function DeliveryAddress({ branch }: { branch: SupplyDestination | null }) {
  const { t } = useTranslation();
  if (!branch) return null;

  // The street line as typed — it is multi-line on purpose, and a landmark is
  // usually the half that finds the place. The locality line is assembled from
  // the reporting fields beneath it; the country is deliberately left out,
  // because it is stored as a code ("IN") and no rider needs it.
  const locality = [branch.city, branch.region, branch.postalCode].filter(Boolean).join(', ');
  const written = [branch.addressLine, locality].filter(Boolean).join('\n');
  const query = mapQuery(branch, [branch.addressLine, locality].filter(Boolean).join(', '));

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('supply.deliverTo')}</Text>
      <View style={styles.card}>
        <Text style={styles.name}>
          {branch.name} · {branch.code}
        </Text>

        {written ? (
          <Text style={styles.address}>{written}</Text>
        ) : (
          <Text style={styles.missing}>{t('supply.noAddress')}</Text>
        )}

        {query ? (
          <PressableScale
            testID="supply-open-map"
            scaleTo={0.97}
            style={styles.mapChip}
            accessibilityRole="link"
            accessibilityLabel={t('supply.openMap')}
            onPress={() => {
              void Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
              );
            }}
          >
            <Ionicons name="navigate-outline" size={14} color={colors.primary} />
            <Text style={styles.mapChipText}>{t('supply.openMap')}</Text>
            <Ionicons name="open-outline" size={12} color={colors.primary} />
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  // No numberOfLines: an address that is cut off is an address nobody can use,
  // and the card grows down as easily in Gujarati as in English.
  address: { fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
  missing: { fontSize: 13, color: colors.textTertiary },
  mapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  mapChipText: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: colors.primary },
});
