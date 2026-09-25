import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import type { SupplyOrderEvent } from '@/types/supply';

/**
 * Everything that has happened to an order — requirement 5.1's material
 * tracking, order tracking, dispatch and payment, which are one list because
 * they are one stream of events.
 *
 * Nothing here renders server prose. An event carries a status, a `reasonCode`
 * and optionally the actor's own `note`; the first two are translated on the
 * device and only the note is shown as typed, because the note is the person's
 * own words and nobody else's to rewrite.
 */

// A Record over every event type, so adding one to the backend enum fails
// `tsc` here until someone picks its icon — rather than rendering a row with a
// hole where the dot should be.
const ICONS: Record<SupplyOrderEvent['type'], keyof typeof Ionicons.glyphMap> = {
  STATUS_CHANGE: 'checkmark-circle-outline',
  DELAY: 'time-outline',
  PAYMENT: 'card-outline',
  ASSIGNMENT: 'bicycle-outline',
};

const TINTS: Record<SupplyOrderEvent['type'], string> = {
  STATUS_CHANGE: colors.primary,
  DELAY: colors.warning,
  PAYMENT: colors.success,
  ASSIGNMENT: colors.primary,
};

function timeOf(iso: string) {
  const at = new Date(iso);
  const hh = `${at.getHours()}`.padStart(2, '0');
  const mm = `${at.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function SupplyTimeline({ events }: { events: SupplyOrderEvent[] }) {
  const { t } = useTranslation();

  return (
    <View style={styles.list}>
      {events.map((event, index) => {
        const actor = event.actorMembership?.user?.name;
        const headline =
          event.type === 'DELAY'
            ? t('supply.delayBadge', { minutes: event.delayMinutes ?? 0 })
            : // The agent's name travels in `note`, snapshotted when the run was
              // given, and the device puts it inside its own sentence — so it
              // reads in the reader's language and still names the right person
              // after a rename.
              event.type === 'ASSIGNMENT'
              ? t('supply.assignedTo', { name: event.note ?? t('supply.assignUnnamed') })
              : event.toStatus
                ? t(`supplyStatus.${event.toStatus}`)
                : event.reasonCode
                  ? t(`supplyEvent.${event.reasonCode}` as never)
                  : '';

        // A rejection carries both a status and a reason; a plain delay carries
        // only the reason. Showing it separately keeps "Cancelled — out of
        // stock" from collapsing into one of the two.
        const reason =
          event.reasonCode && event.type !== 'PAYMENT'
            ? t(`supplyDelay.${event.reasonCode}` as never)
            : null;

        return (
          <View key={event.id} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: TINTS[event.type] }]}>
                <Ionicons name={ICONS[event.type]} size={12} color={colors.white} />
              </View>
              {index < events.length - 1 ? <View style={styles.line} /> : null}
            </View>

            <View style={styles.body}>
              <View style={styles.headline}>
                <Text style={styles.headlineText}>{headline}</Text>
                <Text style={styles.time}>{timeOf(event.createdAt)}</Text>
              </View>
              {reason ? <Text style={styles.reason}>{reason}</Text> : null}
              {/* An assignment's note IS the name in the headline above, so
                  showing it again would print the person twice. */}
              {event.note && event.type !== 'ASSIGNMENT' ? (
                <Text style={styles.note}>{event.note}</Text>
              ) : null}
              {actor ? <Text style={styles.actor}>{t('supply.byWhom', { name: actor })}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { flexDirection: 'row', gap: spacing.md },
  // A fixed-width rail so every dot lines up however long the text beside it
  // runs, which is what makes the column read as a timeline at all.
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 22, height: 22, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  body: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  headlineText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  time: { fontSize: 11.5, color: colors.textTertiary },
  reason: { fontSize: 13, color: colors.textSecondary },
  note: { fontSize: 13, color: colors.text, fontStyle: 'italic' },
  actor: { fontSize: 11.5, color: colors.textTertiary },
});
