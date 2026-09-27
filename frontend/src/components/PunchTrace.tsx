import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { colors, radius, spacing } from '@/theme';
import { formatTime } from '@/utils/date';
import type { AttendanceRecord } from '@/types/staffing';

/**
 * When and where someone punched — what an admin or manager reads to check a
 * day that happened away from a branch.
 *
 * The coordinates have always been stored; nothing had ever displayed them. A
 * delivery agent has no fixed place of work, so their punches are exempt from
 * the branch geofence and record a location instead — and a record nobody can
 * look at is not a record.
 *
 * Renders nothing when there is nothing to say, so it can sit on every day row
 * without turning the ones marked by hand into empty space.
 */

/**
 * Opened with `Linking`, which hands the coordinates to whatever map the
 * device actually has. The https form is used rather than a `geo:` URI because
 * it resolves everywhere — Android offers the maps app, and the web build opens
 * a tab — with no `canOpenURL` dance and no silent no-op when nothing handles
 * the scheme.
 */
function openMap(latitude: string, longitude: string) {
  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
}

export default function PunchTrace({ record }: { record: AttendanceRecord | null }) {
  const { t } = useTranslation();

  const inTime = formatTime(record?.punchInAt, t);
  const outTime = formatTime(record?.punchOutAt, t);
  if (!inTime && !outTime) return null;

  // The punch-out location is the more recent of the two and the one that
  // answers "where did they finish?", so it wins when both exist.
  const lat = record?.punchOutLat ?? record?.punchInLat ?? null;
  const lng = record?.punchOutLng ?? record?.punchInLng ?? null;
  const hasPlace = lat !== null && lng !== null;

  return (
    <View style={styles.wrap}>
      <View style={styles.times}>
        {inTime ? <Text style={styles.time}>{t('attendance.traceIn', { time: inTime })}</Text> : null}
        {outTime ? <Text style={styles.time}>{t('attendance.traceOut', { time: outTime })}</Text> : null}
      </View>

      {hasPlace ? (
        <PressableScale
          testID="punch-trace-map"
          scaleTo={0.97}
          style={styles.place}
          onPress={() => openMap(lat, lng)}
          accessibilityRole="link"
          accessibilityLabel={t('attendance.traceWhere')}
        >
          <Ionicons name="location-outline" size={13} color={colors.primary} />
          <Text style={styles.placeText} numberOfLines={1}>
            {t('attendance.traceWhere')}
          </Text>
          <Ionicons name="open-outline" size={12} color={colors.primary} />
        </PressableScale>
      ) : (
        <Text style={styles.noPlace}>{t('attendance.traceNoLocation')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.xs },
  // Wraps rather than sitting in a fixed row: "आगमन 9:12 AM" and
  // "निर्गमन 6:04 PM" together run past a narrow phone in a way the English
  // never does — and the meridiem made both of them longer still.
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  time: { fontSize: 12, color: colors.textSecondary },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  placeText: { flexShrink: 1, fontSize: 11.5, fontWeight: '600', color: colors.primary },
  noPlace: { fontSize: 11.5, color: colors.textTertiary },
});
