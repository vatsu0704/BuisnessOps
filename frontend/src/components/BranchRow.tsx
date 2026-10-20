import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableScale from '@/components/PressableScale';
import type { Branch } from '@/types/branch';
import { colors, spacing } from '@/theme';

type Props = {
  branch: Branch;
  onPress: () => void;
  /** A divider above, for every row but the first in a list. */
  divided?: boolean;
  testID?: string;
};

/**
 * One branch in a list, on its way to Branch settings.
 *
 * Lifted out of Home's branches card so that card and the full Branches screen
 * cannot drift — they are the same row, and Home shows the first five of it.
 */
export default function BranchRow({ branch, onPress, divided, testID }: Props) {
  const { t } = useTranslation();

  return (
    <PressableScale
      testID={testID}
      scaleTo={0.99}
      style={[styles.row, divided && styles.divided]}
      onPress={onPress}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: branch.status === 'ACTIVE' ? colors.success : colors.textTertiary },
        ]}
      />
      <View style={styles.text}>
        <Text style={styles.name}>{branch.name}</Text>
        {/* A warehouse is in this list because this is the only way to reach its
            settings — and it has to say which it is, or the count of "branches"
            will not match what is on screen. A branch says who pays for its raw
            material (requirement 24), since that changes how every order from it
            is handled. */}
        <Text style={styles.meta}>
          {[
            branch.kind === 'WAREHOUSE'
              ? t('addBranch.kindWarehouse')
              : branch.operatingModel === 'FOCO'
                ? t('addBranch.modelFoco')
                : t('addBranch.modelFm'),
            branch.code,
            branch.city,
            branch.region,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {/* Says out loud that a branch with no radius set enforces none, which is
          otherwise invisible until somebody punches in from the wrong place. */}
      {branch.geofenceRadiusMeters !== null ? (
        <Ionicons name="location" size={14} color={colors.primary} />
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divided: { borderTopWidth: 1, borderTopColor: colors.divider },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
