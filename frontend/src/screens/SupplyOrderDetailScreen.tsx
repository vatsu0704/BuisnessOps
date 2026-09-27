import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { can } from '@/utils/permissions';
import { extractErrorMessage } from '@/api/client';
import {
  acceptSupplyOrder,
  assignSupplyOrder,
  cancelSupplyOrder,
  deliverSupplyOrder,
  dispatchSupplyOrder,
  getSupplyOrder,
  packSupplyOrder,
  postSupplyDelay,
  rejectSupplyOrder,
  verifySupplyPayment,
} from '@/api/supply';
import type { SupplyDelayReason, SupplyOrder } from '@/types/supply';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import OptionRow from '@/components/OptionRow';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import AgentPicker from '@/components/supply/AgentPicker';
import DeliveryAddress from '@/components/supply/DeliveryAddress';
import { SupplyPaymentPill, SupplyStatusPill } from '@/components/supply/SupplyPills';
import SupplyTimeline from '@/components/supply/SupplyTimeline';
import { confirm } from '@/utils/confirm';
import { formatAmount } from '@/utils/format';
import { formatTime } from '@/utils/date';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

/**
 * One supply order, and everything anyone may do to it.
 *
 * One screen for all four roles rather than a cashier copy and a warehouse
 * copy: the order is the same object, and the difference is only which actions
 * are offered. Those come from the capability matrix, so a button that renders
 * is a button whose request will succeed — and the status machine on the server
 * is what actually decides, this just avoids showing a move that cannot be made.
 *
 * Dispatch names the agent who is taking it. The list behind that comes from a
 * supply endpoint guarded by `supplyOrder:fulfil`, NOT from the team list: the
 * warehouse desk holds no `team:view` — it ships to every branch and has no
 * business reading their people — so what it gets is a name, a duty state and a
 * count, and nothing else about the person.
 *
 * "Nobody yet" stays on offer, because a business with no delivery agent yet
 * still has to be able to ship: an unnamed run appears in the queue of every
 * agent covering that branch, which is how it gets picked up.
 */

const DELAY_REASONS: SupplyDelayReason[] = [
  'TRAFFIC',
  'STOCK_OUT',
  'VEHICLE_ISSUE',
  'WEATHER',
  'STAFF_SHORTAGE',
  'OTHER',
];

/** Quick promises, so accepting does not need a date picker to say "an hour". */
const PROMISE_CHOICES = [30, 60, 120];

/**
 * `dispatch` and `assign` share one picker and differ in two ways: dispatch
 * also moves the order, and only dispatch may end with nobody named.
 */
type Panel = 'none' | 'delay' | 'reject' | 'accept' | 'dispatch' | 'assign' | 'cash';

/** Stages at which the desk may still change who is carrying it. */
const ASSIGNABLE = ['ACCEPTED', 'PACKED', 'DISPATCHED'];

export default function SupplyOrderDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'SupplyOrderDetail'>>();
  const businessId = useBusinessId();
  const membership = useMembership();

  const canFulfil = can.fulfilSupplyOrders(membership);
  const canDeliver = can.deliverSupplyOrders(membership);
  const canDelay = can.postSupplyDelay(membership);
  const canOrder = can.orderSupplies(membership);

  const [order, setOrder] = useState<SupplyOrder | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [delayMinutes, setDelayMinutes] = useState('30');
  const [reason, setReason] = useState<SupplyDelayReason>('TRAFFIC');
  const [note, setNote] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setError(null);
    try {
      setOrder(await getSupplyOrder(businessId, params.supplyOrderId));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, params.supplyOrderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  /** Every action is the same shape: call, replace the order, close the panel. */
  async function run(action: (businessId: string, orderId: string) => Promise<SupplyOrder>) {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      setOrder(await action(businessId, order.id));
      setPanel('none');
      setNote('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <ScreenBackground />
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('common.loading')}</Text>
            <PressableScale style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>
          {error ? <Text style={styles.loadError}>{error}</Text> : null}
        </SafeAreaView>
      </View>
    );
  }

  // Money the branch still owes on arrival. Mirrors the server's rule rather
  // than guessing at it: an ONLINE order, or a COD one already settled, has
  // nothing left to hand over.
  const cashOutstanding = order.paymentMode === 'COD' && order.paymentStatus === 'PENDING';

  // The single next step, decided by status and by what this person may do.
  // Null means there is nothing to move along, which is a real state — a
  // delivered order, or a cashier looking at one the warehouse is packing.
  const primary =
    canFulfil && order.status === 'PLACED'
      ? { label: t('supply.accept'), icon: 'checkmark' as const, onPress: () => setPanel('accept') }
      : canFulfil && order.status === 'ACCEPTED'
        ? { label: t('supply.pack'), icon: 'cube' as const, onPress: () => void run(packSupplyOrder) }
        : canFulfil && order.status === 'PACKED'
          ? {
              label: t('supply.dispatch'),
              icon: 'bicycle' as const,
              // Dispatch asks who is taking it rather than going out blind. The
              // picker preselects the freest agent, so the common case is still
              // one press after this one.
              onPress: () => setPanel(panel === 'dispatch' ? 'none' : 'dispatch'),
            }
          : canDeliver && order.status === 'DISPATCHED'
            ? {
                label: t('supply.deliver'),
                icon: 'checkmark-done' as const,
                // Cash on delivery asks first (requirement 22): the goods
                // arriving is not evidence the money did, and only the person
                // at the counter knows. Anything already settled is delivered
                // straight away — a question whose answer cannot matter only
                // teaches people to tap through it.
                onPress: () =>
                  cashOutstanding
                    ? setPanel(panel === 'cash' ? 'none' : 'cash')
                    : void run((b, id) => deliverSupplyOrder(b, id)),
              }
            : null;

  /**
   * Withdrawing an order cannot be undone — placing it again means rebuilding
   * the cart — so it asks first. The wording was written when this screen was
   * built and then never wired up; this is that question finally being asked.
   */
  async function askThenCancel() {
    const ok = await confirm({
      title: t('supply.cancelTitle'),
      body: t('supply.cancelBody'),
      confirmLabel: t('supply.cancel'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) void run((b, id) => cancelSupplyOrder(b, id));
  }

  /**
   * One submit for both panels. Dispatch carries the agent along with the move,
   * so an order never leaves and gets its carrier in two separate acts; a
   * reassignment only changes who, and the picker guarantees somebody.
   */
  function submitAgent(deliveryAgentMembershipId: string | null) {
    if (panel === 'dispatch') {
      void run((b, id) => dispatchSupplyOrder(b, id, deliveryAgentMembershipId ?? undefined));
    } else if (deliveryAgentMembershipId) {
      void run((b, id) => assignSupplyOrder(b, id, deliveryAgentMembershipId));
    }
  }

  const delayable = ['PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED'].includes(order.status);
  const rejectable = canFulfil && ['PLACED', 'ACCEPTED', 'PACKED'].includes(order.status);
  // Changing the carrier, separately from dispatching: the agent who was given
  // it goes home, and the run has to go to somebody else.
  const reassignable = canFulfil && ASSIGNABLE.includes(order.status);
  const cancellable = canOrder && ['DRAFT', 'PLACED'].includes(order.status);
  const verifiable = canFulfil && order.paymentStatus !== 'PENDING' && order.paymentStatus !== 'VERIFIED';

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              {order.orderNumber === null
                ? t('supply.draftTitle')
                : t('supply.orderTitle', { number: order.orderNumber })}
            </Text>
            {order.branch ? <Text style={styles.subtitle}>{order.branch.name}</Text> : null}
          </View>
          <PressableScale
            testID="supply-detail-close"
            style={styles.close}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <View style={styles.pills}>
                <SupplyStatusPill status={order.status} />
                {order.paymentMode ? (
                  <SupplyPaymentPill status={order.paymentStatus} mode={order.paymentMode} />
                ) : null}
                {order.promisedAt ? (
                  <Pill
                    tone="warning"
                    icon="time-outline"
                    label={t('supply.promisedAt', { time: formatTime(order.promisedAt, t) })}
                  />
                ) : null}
              </View>
              {order.paymentReference ? (
                <Text style={styles.reference}>{order.paymentReference}</Text>
              ) : null}
              {order.placedByMembership?.user?.name ? (
                <Text style={styles.placedBy}>
                  {t('supply.placedBy', { name: order.placedByMembership.user.name })}
                </Text>
              ) : null}
              {order.deliveryAgentMembership ? (
                <Text style={styles.placedBy}>
                  {t('supply.assignedTo', {
                    name: order.deliveryAgentMembership.user?.name ?? t('supply.assignUnnamed'),
                  })}
                </Text>
              ) : null}
            </AnimatedEntrance>

            {error ? (
              <AnimatedEntrance key={error} delay={0} style={styles.block}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {/* --- The panels. Inline rather than modal so the order stays on
                screen while someone says what is wrong with it. --- */}
            {panel === 'accept' ? (
              <AnimatedEntrance delay={0} style={styles.block}>
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>{t('supply.promiseQuestion')}</Text>
                  <View style={styles.choiceRow}>
                    {PROMISE_CHOICES.map((minutes) => (
                      <SegmentedOption
                        key={minutes}
                        testID={`supply-promise-${minutes}`}
                        title={t('supply.delayBadge', { minutes })}
                        selected={false}
                        onPress={() =>
                          void run((b, id) =>
                            acceptSupplyOrder(b, id, new Date(Date.now() + minutes * 60_000).toISOString())
                          )
                        }
                      />
                    ))}
                  </View>
                  <PressableScale
                    testID="supply-promise-skip"
                    style={styles.panelSkip}
                    onPress={() => void run((b, id) => acceptSupplyOrder(b, id))}
                  >
                    <Text style={styles.panelSkipText}>{t('supply.promiseSkip')}</Text>
                  </PressableScale>
                </View>
              </AnimatedEntrance>
            ) : null}

            {/* --- The cash question (requirement 22). Inline like the other
                panels rather than an alert: the amount and the branch it is
                owed by are both on the screen behind it, and this is the one
                question in the app whose answer moves money. --- */}
            {panel === 'cash' ? (
              <AnimatedEntrance delay={0} style={styles.block}>
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>{t('supply.cashTitle')}</Text>
                  <Text style={styles.cashQuestion}>
                    {t('supply.cashQuestion', {
                      amount: formatAmount(Number(order.totalAmount), order.currency),
                      branch: order.branch?.name ?? '',
                    })}
                  </Text>
                  <Text style={styles.cashHint}>{t('supply.cashHint')}</Text>
                  <View style={styles.panelActions}>
                    <PressableScale
                      testID="supply-cash-no"
                      style={styles.panelCancel}
                      onPress={() => setPanel('none')}
                    >
                      <Text style={styles.panelCancelText}>{t('supply.cashNo')}</Text>
                    </PressableScale>
                    <PrimaryButton
                      testID="supply-cash-yes"
                      title={t('supply.cashYes')}
                      icon="cash-outline"
                      loading={isBusy}
                      style={styles.panelSubmit}
                      onPress={() => void run((b, id) => deliverSupplyOrder(b, id, true))}
                    />
                  </View>
                </View>
              </AnimatedEntrance>
            ) : null}

            {panel === 'dispatch' || panel === 'assign' ? (
              <AnimatedEntrance delay={0} style={styles.block}>
                <AgentPicker
                  title={t('supply.assignAgent')}
                  submitLabel={panel === 'dispatch' ? t('supply.dispatch') : t('supply.reassign')}
                  allowNobody={panel === 'dispatch'}
                  isBusy={isBusy}
                  onSubmit={submitAgent}
                  onCancel={() => setPanel('none')}
                />
              </AnimatedEntrance>
            ) : null}

            {panel === 'delay' || panel === 'reject' ? (
              <AnimatedEntrance delay={0} style={styles.block}>
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>
                    {panel === 'delay' ? t('supply.delayTitle') : t('supply.reject')}
                  </Text>

                  {panel === 'delay' ? (
                    <View style={styles.minutesRow}>
                      <Text style={styles.fieldLabel}>{t('supply.delayMinutes')}</Text>
                      <TextInput
                        testID="supply-delay-minutes"
                        style={styles.minutesInput}
                        value={delayMinutes}
                        onChangeText={setDelayMinutes}
                        keyboardType="number-pad"
                        maxLength={4}
                      />
                    </View>
                  ) : null}

                  <Text style={styles.fieldLabel}>{t('supply.delayReason')}</Text>
                  {/* A stacked list, not a row of chips: six reasons in a row
                      would wrap one character per line at phone width. */}
                  <View style={styles.reasonList}>
                    {DELAY_REASONS.map((value) => (
                      <OptionRow
                        key={value}
                        testID={`supply-reason-${value}`}
                        title={t(`supplyDelay.${value}`)}
                        selected={reason === value}
                        onPress={() => setReason(value)}
                      />
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>
                    {t('supply.note')} · {t('supply.noteOptional')}
                  </Text>
                  <TextInput
                    testID="supply-note"
                    style={styles.noteInput}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={300}
                  />

                  <View style={styles.panelActions}>
                    <PressableScale style={styles.panelCancel} onPress={() => setPanel('none')}>
                      <Text style={styles.panelCancelText}>{t('common.cancel')}</Text>
                    </PressableScale>
                    <PrimaryButton
                      testID="supply-panel-submit"
                      title={panel === 'delay' ? t('supply.postDelay') : t('supply.reject')}
                      loading={isBusy}
                      style={styles.panelSubmit}
                      onPress={() =>
                        panel === 'delay'
                          ? void run((b, id) =>
                              postSupplyDelay(b, id, {
                                delayMinutes: Number(delayMinutes) || 0,
                                reasonCode: reason,
                                note: note.trim() || undefined,
                              })
                            )
                          : void run((b, id) =>
                              rejectSupplyOrder(b, id, { reasonCode: reason, note: note.trim() || undefined })
                            )
                      }
                    />
                  </View>
                </View>
              </AnimatedEntrance>
            ) : null}

            {/* --- Where it is going. High on the screen because for the
                person carrying it, this is the whole job. --- */}
            {order.status !== 'DRAFT' ? (
              <AnimatedEntrance delay={step(1)} style={styles.block}>
                <DeliveryAddress branch={order.branch} />
              </AnimatedEntrance>
            ) : null}

            {/* --- What is on it --- */}
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <Text style={styles.sectionTitle}>
                {t('supply.reviewCount', { count: order.items.length })}
              </Text>
              <View style={styles.card}>
                {order.items.map((line) => (
                  <View key={line.id} style={styles.line}>
                    <Text style={styles.lineName} numberOfLines={1}>
                      {line.itemNameSnapshot}
                    </Text>
                    <Text style={styles.lineQty}>
                      {Number(line.quantity)} {line.unitSnapshot}
                    </Text>
                    <Text style={styles.lineTotal}>
                      {formatAmount(Number(line.lineTotal), order.currency)}
                    </Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('supply.total')}</Text>
                  <Text style={styles.totalValue}>
                    {formatAmount(Number(order.totalAmount), order.currency)}
                  </Text>
                </View>
              </View>
            </AnimatedEntrance>

            {/* --- Everything that has happened (requirement 5.1) --- */}
            {order.events.length > 0 ? (
              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <Text style={styles.sectionTitle}>{t('supply.timeline')}</Text>
                <View style={styles.card}>
                  <SupplyTimeline events={order.events} />
                </View>
              </AnimatedEntrance>
            ) : null}

            {/* --- The actions that are not the next step --- */}
            {(canDelay && delayable) || rejectable || cancellable || verifiable || reassignable ? (
              <AnimatedEntrance delay={step(4)} style={styles.block}>
                <View style={styles.actions}>
                  {reassignable ? (
                    <PressableScale
                      testID="supply-action-reassign"
                      style={styles.action}
                      onPress={() => setPanel(panel === 'assign' ? 'none' : 'assign')}
                    >
                      <Ionicons name="bicycle-outline" size={16} color={colors.primary} />
                      <Text style={styles.actionText}>{t('supply.reassign')}</Text>
                    </PressableScale>
                  ) : null}

                  {canDelay && delayable ? (
                    <PressableScale
                      testID="supply-action-delay"
                      style={styles.action}
                      onPress={() => setPanel(panel === 'delay' ? 'none' : 'delay')}
                    >
                      <Ionicons name="time-outline" size={16} color={colors.warning} />
                      <Text style={styles.actionText}>{t('supply.postDelay')}</Text>
                    </PressableScale>
                  ) : null}

                  {verifiable ? (
                    <>
                      <PressableScale
                        testID="supply-action-verify"
                        style={styles.action}
                        onPress={() => void run((b, id) => verifySupplyPayment(b, id, { outcome: 'VERIFIED' }))}
                      >
                        <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
                        <Text style={styles.actionText}>{t('supply.markVerified')}</Text>
                      </PressableScale>
                      <PressableScale
                        testID="supply-action-verify-failed"
                        style={styles.action}
                        onPress={() => void run((b, id) => verifySupplyPayment(b, id, { outcome: 'FAILED' }))}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                        <Text style={styles.actionText}>{t('supply.markFailed')}</Text>
                      </PressableScale>
                    </>
                  ) : null}

                  {rejectable ? (
                    <PressableScale
                      testID="supply-action-reject"
                      style={styles.action}
                      onPress={() => setPanel(panel === 'reject' ? 'none' : 'reject')}
                    >
                      <Ionicons name="ban-outline" size={16} color={colors.error} />
                      <Text style={styles.actionText}>{t('supply.reject')}</Text>
                    </PressableScale>
                  ) : null}

                  {cancellable ? (
                    <PressableScale
                      testID="supply-action-cancel"
                      style={styles.action}
                      onPress={() => void askThenCancel()}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.actionText}>{t('supply.cancel')}</Text>
                    </PressableScale>
                  ) : null}
                </View>
              </AnimatedEntrance>
            ) : null}
          </ScrollView>

          {primary ? (
            <View style={styles.tray}>
              <PrimaryButton
                testID="supply-primary-action"
                title={primary.label}
                icon={primary.icon}
                loading={isBusy}
                onPress={primary.onPress}
              />
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  flex: { flex: 1 },
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
  subtitle: { fontSize: 13, color: colors.textSecondary },
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
  loadError: { paddingHorizontal: spacing.xl, color: colors.error, fontSize: 13 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.lg },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reference: { marginTop: spacing.sm, fontSize: 13, color: colors.textSecondary },
  placedBy: { marginTop: 2, fontSize: 12.5, color: colors.textTertiary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineName: { flex: 1, fontSize: 13.5, color: colors.text },
  lineQty: { fontSize: 12.5, color: colors.textTertiary },
  lineTotal: { minWidth: 62, textAlign: 'right', fontSize: 13.5, fontWeight: '700', color: colors.text },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  totalLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  totalValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  // The amount and the branch are the whole question, so they are read first
  // and at a size that survives being read on a bike in the sun.
  cashQuestion: { fontSize: 15.5, fontWeight: '600', lineHeight: 22, color: colors.text },
  cashHint: { fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  minutesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  minutesInput: {
    minWidth: 64,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  reasonList: { gap: spacing.xs },
  noteInput: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  panelActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panelCancel: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  panelCancelText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  panelSubmit: { flex: 1 },
  panelSkip: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  panelSkipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  // A wrap, so four actions stack instead of squeezing to a character each.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    flexGrow: 1,
    flexBasis: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.text },
  tray: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.md,
  },
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
