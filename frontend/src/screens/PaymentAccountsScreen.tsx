import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useVendors } from '@/hooks/useVendors';
import { extractErrorMessage } from '@/api/client';
import { getPaymentAccount, setPaymentAccount, setVendorUpi } from '@/api/supply';
import { refreshVendors } from '@/store/vendorStore';
import type { PaymentAccount } from '@/types/supply';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import UpiAccountEditor from '@/components/payments/UpiAccountEditor';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

/**
 * Payment QR codes — where branches' money goes (requirement 26).
 *
 * One UPI ID for the warehouse, and one for each vendor. Every payment QR in the
 * app is generated from these, with the order's exact amount in it, so this is
 * the only place a QR is "set up" — there is no image to upload.
 *
 * Behind `paymentAccount:manage`: accounts and the owner. The warehouse desk
 * adds and names vendors but cannot reach this screen, because whoever can
 * change where money goes must not also be whoever ships the goods.
 *
 * Vendors are rows that open one at a time, rather than a column of editors:
 * the list grows with the business, and a screen of open forms is a screen
 * nobody can find their way down.
 */
export default function PaymentAccountsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const businessId = useBusinessId();
  const { vendors, isLoading: vendorsLoading, error: vendorsError, refresh } = useVendors();

  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [openVendorId, setOpenVendorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setAccount(await getPaymentAccount(businessId));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refresh();
    }, [load, refresh])
  );

  async function saveWarehouse(upiId: string | null, upiName: string | null) {
    if (!businessId) return;
    setAccount(await setPaymentAccount(businessId, { upiId, upiName }));
  }

  async function saveVendor(vendorId: string, upiId: string | null, upiName: string | null) {
    if (!businessId) return;
    await setVendorUpi(businessId, vendorId, { upiId, upiName });
    await refreshVendors();
  }

  const shownError = error ?? vendorsError;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('paymentAccounts.title')}</Text>
            <Text style={styles.subtitle}>{t('paymentAccounts.subtitle')}</Text>
          </View>
          <PressableScale testID="payment-accounts-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isLoading || vendorsLoading}
                onRefresh={() => {
                  void load();
                  void refresh();
                }}
                tintColor={colors.primary}
              />
            }
          >
            {shownError ? (
              <AnimatedEntrance key={shownError} delay={0} style={styles.block}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{shownError}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <View style={styles.explainer}>
                <Ionicons name="qr-code-outline" size={18} color={colors.primary} />
                <Text style={styles.explainerText}>{t('paymentAccounts.explainer')}</Text>
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <Text style={styles.sectionTitle}>{t('paymentAccounts.warehouseSection')}</Text>
              <Text style={styles.sectionHint}>{t('paymentAccounts.warehouseHint')}</Text>
              {account ? (
                <UpiAccountEditor
                  testID="payment-accounts-warehouse"
                  payeeLabel={t('supply.fromWarehouse')}
                  fallbackName={account.businessName}
                  upiId={account.upiId}
                  upiName={account.upiName}
                  updatedAt={account.upiUpdatedAt}
                  updatedByName={account.upiUpdatedByMembership?.user?.name ?? null}
                  onSave={saveWarehouse}
                />
              ) : null}
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <Text style={styles.sectionTitle}>{t('paymentAccounts.vendorsSection')}</Text>
              <Text style={styles.sectionHint}>{t('paymentAccounts.vendorsHint')}</Text>
              {!vendorsLoading && vendors.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="storefront-outline" size={22} color={colors.textTertiary} />
                  <Text style={styles.emptyTitle}>{t('vendors.empty')}</Text>
                  <Text style={styles.emptyBody}>{t('paymentAccounts.noVendorsBody')}</Text>
                </View>
              ) : null}
              <View style={styles.list}>
                {vendors.map((vendor) => {
                  const isOpen = openVendorId === vendor.id;
                  return (
                    <View key={vendor.id} style={!vendor.isActive && styles.withdrawn}>
                      <PressableScale
                        testID={`payment-accounts-vendor-${vendor.id}`}
                        style={[styles.vendorRow, isOpen && styles.vendorRowOpen]}
                        scaleTo={0.99}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        onPress={() => setOpenVendorId(isOpen ? null : vendor.id)}
                      >
                        <View style={styles.vendorText}>
                          <Text style={styles.vendorName}>{vendor.name}</Text>
                          <Text style={styles.vendorMeta} numberOfLines={1}>
                            {vendor.upiId ?? t('paymentAccounts.noUpiYet')}
                          </Text>
                          <View style={styles.pills}>
                            <Pill
                              label={vendor.upiId ? t('paymentAccounts.qrSet') : t('paymentAccounts.qrNotSet')}
                              tone={vendor.upiId ? 'success' : 'warning'}
                              icon={vendor.upiId ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                            />
                            {!vendor.isActive ? <Pill label={t('supply.withdrawn')} tone="muted" /> : null}
                          </View>
                        </View>
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
                      </PressableScale>
                      {isOpen ? (
                        <View style={styles.editor}>
                          <UpiAccountEditor
                            testID={`payment-accounts-vendor-editor-${vendor.id}`}
                            payeeLabel={vendor.name}
                            fallbackName={vendor.name}
                            upiId={vendor.upiId}
                            upiName={vendor.upiName}
                            updatedAt={vendor.upiUpdatedAt}
                            updatedByName={vendor.upiUpdatedByMembership?.user?.name ?? null}
                            onSave={(upiId, upiName) => saveVendor(vendor.id, upiId, upiName)}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </AnimatedEntrance>
          </ScrollView>
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
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
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
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.lg },
  explainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  explainerText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionHint: { fontSize: 12.5, color: colors.textTertiary, lineHeight: 17, marginTop: 4, marginBottom: spacing.sm },
  list: { gap: spacing.sm },
  withdrawn: { opacity: 0.6 },
  vendorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  vendorRowOpen: { borderColor: colors.primary },
  vendorText: { flex: 1, minWidth: 0, gap: 2 },
  vendorName: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  vendorMeta: { fontSize: 12.5, color: colors.textSecondary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  editor: { marginTop: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.md,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
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
