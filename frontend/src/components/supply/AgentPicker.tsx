import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { listDeliveryAgents } from '@/api/supply';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import OptionRow from '@/components/OptionRow';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import { colors, radius, spacing } from '@/theme';
import { formatTime } from '@/utils/date';
import type { DeliveryAgent } from '@/types/supply';

/**
 * Who is taking this run — the warehouse desk's picker.
 *
 * The list comes from a supply endpoint guarded by `supplyOrder:fulfil`, not
 * from the team list: the desk holds no `team:view` and must not need it to do
 * its own job. What comes back is a name, a duty state and a count, and that is
 * all this shows.
 *
 * **Availability is a caption, never a lock.** Attendance is the honest source
 * for "on shift", and it has nothing to say about an agent with no staff record
 * or a business that does not punch in at all — so the free agents sort first
 * and the first one is preselected, but every agent stays selectable. The
 * person at the desk knows things this screen does not.
 *
 * A mapped list rather than a `FlatList`, deliberately: this sits inside the
 * order screen's ScrollView, where React Native documents nesting a
 * VirtualizedList of the same orientation as unsupported, and a business's
 * delivery agents are a handful of rows rather than a feed.
 */

type Props = {
  title: string;
  submitLabel: string;
  /** Dispatch may go out unassigned; a reassignment has to name somebody. */
  allowNobody: boolean;
  isBusy: boolean;
  /** `null` means "nobody yet". */
  onSubmit: (deliveryAgentMembershipId: string | null) => void;
  onCancel: () => void;
};

/** `undefined` while the list is still loading and nothing is chosen yet. */
type Choice = string | null | undefined;

export default function AgentPicker({
  title,
  submitLabel,
  allowNobody,
  isBusy,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();

  const [agents, setAgents] = useState<DeliveryAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>(undefined);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const found = await listDeliveryAgents(businessId);
      setAgents(found);
      // The server sorts the freest first, so the first row is the answer to
      // "who is available" — preselected, so the common case is one press.
      setChoice(found[0]?.membershipId ?? (allowNobody ? null : undefined));
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, allowNobody]);

  useEffect(() => {
    void load();
  }, [load]);

  function describe(agent: DeliveryAgent): string {
    const duty =
      agent.dutyState === 'ON_DUTY'
        ? t('supply.dutyOn', { time: formatTime(agent.onDutySince, t) })
        : agent.dutyState === 'OFF_DUTY'
          ? t('supply.dutyOff')
          : t('supply.dutyUnknown');
    const load =
      agent.activeRuns === 0 ? t('supply.free') : t('supply.carrying', { count: agent.activeRuns });
    return `${duty} · ${load}`;
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>

      {isLoading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {!isLoading && agents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('supply.noAgents')}</Text>
          <Text style={styles.emptyBody}>{t('supply.noAgentsBody')}</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {agents.map((agent) => (
          <OptionRow
            key={agent.membershipId}
            testID={`supply-agent-${agent.membershipId}`}
            icon="bicycle-outline"
            title={agent.name ?? t('supply.assignUnnamed')}
            description={describe(agent)}
            selected={choice === agent.membershipId}
            onPress={() => setChoice(agent.membershipId)}
          />
        ))}

        {allowNobody ? (
          <OptionRow
            testID="supply-agent-nobody"
            icon="people-outline"
            title={t('supply.assignNobody')}
            description={t('supply.assignNobodyHint')}
            selected={choice === null}
            onPress={() => setChoice(null)}
          />
        ) : null}
      </View>

      <View style={styles.actions}>
        <PressableScale style={styles.cancel} onPress={onCancel}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </PressableScale>
        <PrimaryButton
          testID="supply-agent-submit"
          title={submitLabel}
          loading={isBusy}
          disabled={choice === undefined}
          style={styles.submit}
          onPress={() => onSubmit(choice ?? null)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  loader: { alignSelf: 'flex-start' },
  error: { fontSize: 13, color: colors.error },
  // Rows stack, so another agent costs height rather than squeezing the ones
  // already there.
  list: { gap: spacing.xs },
  empty: { gap: 2, paddingVertical: spacing.xs },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancel: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  submit: { flex: 1 },
});
