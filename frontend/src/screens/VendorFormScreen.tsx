import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useVendors } from '@/hooks/useVendors';
import { extractErrorMessage } from '@/api/client';
import { createVendor, updateVendor } from '@/api/supply';
import { refreshVendors } from '@/store/vendorStore';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { haptics } from '@/utils/haptics';

/**
 * Add or edit one third-party vendor — requirement 25. The desk's half.
 *
 * A name, and a phone number the "send to vendor" WhatsApp message goes to.
 * NOT where a payment to them goes: that is shown here, read-only, because the
 * desk is who notices it is missing — but setting it is accounts' job
 * (`paymentAccount:manage`), on the Payment QR codes screen.
 *
 * One screen for adding and editing, like the raw-material item form, so the
 * two cannot drift into asking different questions.
 */
export default function VendorFormScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'VendorForm'>>();
  const businessId = useBusinessId();
  const vendorId = params?.vendorId;
  const { vendors } = useVendors();
  const vendor = useMemo(() => vendors.find((candidate) => candidate.id === vendorId) ?? null, [vendors, vendorId]);

  const [name, setName] = useState(vendor?.name ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [loadedFor, setLoadedFor] = useState<string | null>(vendor?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The store may still be loading when the screen opens; fill the fields the
  // moment the vendor arrives, once, without overwriting what is being typed.
  if (vendor && loadedFor !== vendor.id) {
    setLoadedFor(vendor.id);
    setName(vendor.name);
    setPhone(vendor.phone ?? '');
  }

  async function save() {
    if (!businessId || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null };
      if (vendorId) await updateVendor(businessId, vendorId, payload);
      else await createVendor(businessId, payload);
      // Before leaving: the list, the item form and the Payment QR codes screen
      // all read one shared list.
      await refreshVendors();
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  /**
   * Withdrawing takes them off every item picker and stops new orders to them,
   * so it asks first. Bringing them back is the same button, and does not.
   */
  async function toggleActive() {
    if (!businessId || !vendor || isSaving) return;
    if (vendor.isActive) {
      const ok = await confirm({
        title: t('vendors.withdrawTitle', { name: vendor.name }),
        body: t('vendors.withdrawBody'),
        confirmLabel: t('vendors.withdraw'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateVendor(businessId, vendor.id, { isActive: !vendor.isActive });
      await refreshVendors();
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = name.trim().length > 0;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{vendorId ? t('vendors.edit') : t('vendors.add')}</Text>
          <PressableScale testID="vendor-form-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error ? (
              <AnimatedEntrance key={error} delay={0} style={styles.block}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {vendor && !vendor.isActive ? (
              <AnimatedEntrance delay={step(0)} style={styles.block}>
                <Pill label={t('supply.withdrawn')} tone="muted" />
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.form}>
                <FormInput
                  testID="vendor-name"
                  label={t('vendors.name')}
                  icon="storefront-outline"
                  placeholder={t('vendors.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                />
                <FormInput
                  testID="vendor-phone"
                  label={t('vendors.phone')}
                  hint={t('addStaff.optional')}
                  icon="logo-whatsapp"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                <Text style={styles.footnote}>{t('vendors.phoneHint')}</Text>
              </View>
            </AnimatedEntrance>

            {vendor ? (
              <AnimatedEntrance delay={step(2)} style={styles.block}>
                {/* Read-only on purpose — see the header. */}
                <View style={styles.payee}>
                  <Ionicons
                    name={vendor.upiId ? 'qr-code-outline' : 'alert-circle-outline'}
                    size={18}
                    color={vendor.upiId ? colors.success : colors.warning}
                  />
                  <Text style={styles.payeeText}>
                    {vendor.upiId
                      ? t('vendors.paysTo', { upiId: vendor.upiId })
                      : t('vendors.noUpiYet')}
                  </Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(3)} style={styles.block}>
              <PrimaryButton
                testID="vendor-save"
                title={vendorId ? t('vendors.save') : t('vendors.add')}
                loading={isSaving}
                disabled={!canSave}
                onPress={() => void save()}
              />
            </AnimatedEntrance>

            {vendor ? (
              <AnimatedEntrance delay={step(4)} style={styles.block}>
                <PressableScale
                  testID="vendor-toggle-active"
                  style={styles.toggleRow}
                  onPress={() => void toggleActive()}
                >
                  <Ionicons
                    name={vendor.isActive ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={vendor.isActive ? colors.warning : colors.success}
                  />
                  <Text style={styles.toggleText}>{vendor.isActive ? t('vendors.withdraw') : t('vendors.restore')}</Text>
                </PressableScale>
              </AnimatedEntrance>
            ) : null}
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
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.lg },
  form: { gap: spacing.md },
  footnote: { fontSize: 12, color: colors.textTertiary, lineHeight: 17, marginTop: -spacing.xs },
  payee: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  payeeText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  toggleText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.text },
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
