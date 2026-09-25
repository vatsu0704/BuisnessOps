import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { extractErrorMessage } from '@/api/client';
import { getSupplyOrder, placeSupplyOrder, updateSupplyOrderItem } from '@/api/supply';
import type { SupplyOrder, SupplyPaymentMode } from '@/types/supply';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { formatAmount } from '@/utils/format';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

/**
 * Review the order and send it — requirement 5.
 *
 * This is where quantities are actually decided, which is why each line has a
 * real numeric field rather than only a stepper: raw material is ordered in
 * twenties and halves, and getting to 20 kg by tapping a plus is not a design.
 * The steppers stay for the one-more case.
 *
 * Payment is RECORDED here, not taken. There is no gateway and no money moves
 * through this app — ONLINE means "we paid another way, here is the reference",
 * and the warehouse checks it against their own records afterwards.
 */
export default function SupplyCartScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'SupplyCart'>>();
  const businessId = useBusinessId();

  const [order, setOrder] = useState<SupplyOrder | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<SupplyPaymentMode>('COD');
  const [reference, setReference] = useState('');
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

  async function setQuantity(itemId: string, quantity: number) {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const updated = await updateSupplyOrderItem(businessId, order.id, itemId, quantity);
      setOrder(updated);
      // Drop the local draft so the field shows what the server actually stored
      // rather than what was typed at it.
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  /** Commit a typed quantity, ignoring anything that is not a positive number. */
  function commitDraft(itemId: string, current: number) {
    const typed = drafts[itemId];
    if (typed === undefined) return;
    const parsed = Number(typed.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDrafts((prev) => ({ ...prev, [itemId]: String(current) }));
      return;
    }
    if (parsed === current) return;
    void setQuantity(itemId, parsed);
  }

  async function place() {
    if (!businessId || !order || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const placed = await placeSupplyOrder(businessId, order.id, {
        paymentMode: mode,
        paymentReference: mode === 'ONLINE' ? reference.trim() : undefined,
      });
      // Replace rather than push: the cart is gone once it is an order, and
      // going "back" to it would show a screen that no longer exists.
      navigation.replace('SupplyOrderDetail', { supplyOrderId: placed.id });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  const isEmpty = !order || order.items.length === 0;
  const canPlace = !isEmpty && (mode === 'COD' || reference.trim().length > 0);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('supply.cartTitle')}</Text>
          <PressableScale testID="supply-cart-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error ? (
              <AnimatedEntrance key={error} delay={0} style={styles.block}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {isEmpty ? (
              <AnimatedEntrance delay={step(0)} style={styles.block}>
                <View style={styles.emptyCard}>
                  <Ionicons name="cube-outline" size={22} color={colors.textTertiary} />
                  <Text style={styles.emptyTitle}>{t('supply.cartEmpty')}</Text>
                  <Text style={styles.emptyBody}>{t('supply.cartEmptyBody')}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {order && order.items.length > 0 ? (
              <AnimatedEntrance delay={step(0)} style={styles.block}>
                <Text style={styles.sectionTitle}>{t('supply.reviewCount', { count: order.items.length })}</Text>
                <View style={styles.list}>
                  {order.items.map((line) => {
                    const current = Number(line.quantity);
                    return (
                      <View key={line.id} style={styles.line}>
                        <View style={styles.lineText}>
                          <Text style={styles.lineName} numberOfLines={1}>
                            {line.itemNameSnapshot}
                          </Text>
                          <Text style={styles.lineMeta}>
                            {t('supply.perUnit', {
                              price: formatAmount(Number(line.unitPrice), order.currency),
                              unit: line.unitSnapshot,
                            })}
                          </Text>
                        </View>

                        <View style={styles.qtyGroup}>
                          <PressableScale
                            testID={`supply-less-${line.id}`}
                            style={styles.stepper}
                            onPress={() => void setQuantity(line.id, Math.max(0, current - 1))}
                          >
                            <Ionicons name="remove" size={15} color={colors.text} />
                          </PressableScale>
                          <TextInput
                            testID={`supply-qty-${line.id}`}
                            style={styles.qtyInput}
                            value={drafts[line.id] ?? String(current)}
                            onChangeText={(text) => setDrafts((prev) => ({ ...prev, [line.id]: text }))}
                            onBlur={() => commitDraft(line.id, current)}
                            onSubmitEditing={() => commitDraft(line.id, current)}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            selectTextOnFocus
                          />
                          <PressableScale
                            testID={`supply-more-${line.id}`}
                            style={styles.stepper}
                            onPress={() => void setQuantity(line.id, current + 1)}
                          >
                            <Ionicons name="add" size={15} color={colors.text} />
                          </PressableScale>
                        </View>

                        <Text style={styles.lineTotal}>
                          {formatAmount(Number(line.lineTotal), order.currency)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </AnimatedEntrance>
            ) : null}

            {!isEmpty ? (
              <AnimatedEntrance delay={step(1)} style={styles.block}>
                <Text style={styles.sectionTitle}>{t('supply.paymentMode')}</Text>
                {/* Two options, side by side — exactly what SegmentedOption is
                    for. A third would make this a stacked OptionRow list. */}
                <View style={styles.modeRow}>
                  <SegmentedOption
                    testID="supply-mode-cod"
                    title={t('supply.payCod')}
                    caption={t('supply.payCodHint')}
                    icon="cash-outline"
                    selected={mode === 'COD'}
                    onPress={() => setMode('COD')}
                  />
                  <SegmentedOption
                    testID="supply-mode-online"
                    title={t('supply.payOnline')}
                    caption={t('supply.payOnlineHint')}
                    icon="card-outline"
                    selected={mode === 'ONLINE'}
                    onPress={() => setMode('ONLINE')}
                  />
                </View>

                {mode === 'ONLINE' ? (
                  <View style={styles.referenceField}>
                    <FormInput
                      testID="supply-reference"
                      label={t('supply.reference')}
                      icon="receipt-outline"
                      value={reference}
                      onChangeText={setReference}
                      placeholder={t('supply.referencePlaceholder')}
                      autoCapitalize="characters"
                    />
                  </View>
                ) : null}
              </AnimatedEntrance>
            ) : null}
          </ScrollView>

          {!isEmpty && order ? (
            <View style={styles.tray}>
              <View style={styles.trayRow}>
                <Text style={styles.trayLabel}>{t('supply.total')}</Text>
                <Text style={styles.trayTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatAmount(Number(order.totalAmount), order.currency)}
                </Text>
              </View>
              <PrimaryButton
                testID="supply-place"
                title={t('supply.place')}
                icon="paper-plane-outline"
                loading={isBusy}
                disabled={!canPlace}
                onPress={() => void place()}
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flexShrink: 1, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  block: { marginTop: spacing.lg },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  // The line wraps its name and lets the controls keep their size, so a long
  // item name shortens instead of squeezing the quantity field to nothing.
  lineText: { flex: 1, gap: 2, minWidth: 0 },
  lineName: { fontSize: 14, fontWeight: '600', color: colors.text },
  lineMeta: { fontSize: 12, color: colors.textTertiary },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    minWidth: 44,
    textAlign: 'center',
    paddingVertical: spacing.xs,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineTotal: { minWidth: 62, textAlign: 'right', fontSize: 13.5, fontWeight: '700', color: colors.text },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  referenceField: { marginTop: spacing.md },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.md,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  /**
   * Stacked, not a row.
   *
   * The total and the button used to share one line, with the button sized by
   * its own content and refusing to shrink. On a 320dp phone that left about
   * 89dp for the amount — and "Place order" is the short version: every Indic
   * translation of it runs longer, so the languages most likely to be used are
   * the ones where the figure got squeezed first. A row whose contents both
   * grow with the language is a row that breaks in the language nobody tested.
   *
   * The total gets its own line and the button spans the width, which is both
   * the standard checkout shape and one that cannot degrade as a label grows.
   */
  tray: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.md,
  },
  trayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  trayLabel: { fontSize: 12, color: colors.textSecondary },
  // flexShrink so a seven-figure order scales down rather than shoving the
  // word "Total" off its own line.
  trayTotal: { flexShrink: 1, fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
