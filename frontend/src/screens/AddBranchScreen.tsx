import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { createBranch } from '@/api/business';
import { refreshBranches } from '@/store/branchStore';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { useBusinessId } from '@/hooks/useBusinessId';
import type { BranchKind } from '@/types/branch';
import { getCurrentCoords } from '@/utils/location';

type Props = NativeStackScreenProps<AppStackParamList, 'AddBranch'>;

export default function AddBranchScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const business = useAuthStore((s) => s.business);
  const businessId = useBusinessId();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  // What this location IS. A warehouse is staffed and punched into like any
  // other location, and simply does not sell or order — see BranchKind.
  const [kind, setKind] = useState<BranchKind>('BRANCH');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  // Where a delivery goes, as opposed to where the branch is for reporting.
  // Optional here and editable in Branch settings afterwards: a branch that
  // never receives a supply order never needs one.
  const [addressLine, setAddressLine] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [timezone, setTimezone] = useState(business?.timezone ?? 'Asia/Kolkata');
  const [currency, setCurrency] = useState(business?.defaultCurrency ?? 'INR');

  // Optional, and the form says so: a branch with no coordinates enforces no
  // punch-in radius, which is the default and a perfectly ordinary branch.
  // Capturing them here is what lets a geofence exist at all without an API
  // call by hand; Branch settings can add or change them later either way.
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedRadius = radius.trim() === '' ? null : Number(radius);
  const hasCoordinates = latitude.trim() !== '' && longitude.trim() !== '';
  // The same rule the server enforces: a radius with no coordinates could
  // never be checked against anything.
  const radiusNeedsCoordinates = parsedRadius !== null && !hasCoordinates;
  const radiusIsValid = parsedRadius === null || (Number.isFinite(parsedRadius) && parsedRadius > 0);

  const canSubmit =
    !!businessId &&
    name.trim().length > 0 &&
    code.trim().length > 0 &&
    timezone.trim().length > 0 &&
    radiusIsValid &&
    !radiusNeedsCoordinates &&
    !isSubmitting;

  async function handleUseCurrentLocation() {
    haptics.tap();
    setIsLocating(true);
    setError(null);
    const coords = await getCurrentCoords();
    setIsLocating(false);
    if (!coords) {
      haptics.error();
      setError(t('branchSettings.locationUnavailable'));
      return;
    }
    setLatitude(coords.latitude.toFixed(6));
    setLongitude(coords.longitude.toFixed(6));
    haptics.success();
  }

  async function handleSubmit() {
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createBranch(businessId, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        kind,
        timezone: timezone.trim(),
        city: city.trim() || undefined,
        region: region.trim() || undefined,
        addressLine: addressLine.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        country: business?.country,
        currency: currency.trim() || undefined,
        latitude: hasCoordinates ? Number(latitude) : undefined,
        longitude: hasCoordinates ? Number(longitude) : undefined,
        geofenceRadiusMeters: parsedRadius ?? undefined,
      });
      // Before navigating away: every screen reads one shared list, so this is
      // what makes the new branch appear on Home, in Settings and in every
      // branch picker at once. Without it the list is correct on the server and
      // stale on screen until the app is restarted.
      await refreshBranches();
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('addBranch.title')}</Text>
            <PressableScale testID="add-branch-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <Text style={styles.subtitle}>{t('addBranch.subtitle')}</Text>
            </AnimatedEntrance>

            {error ? (
              <AnimatedEntrance key={error} delay={0} distance={-8}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(1)}>
              <View style={styles.card}>
                {/* Two options, side by side — exactly what SegmentedOption is
                    for. It comes first because it changes what the rest of the
                    form is describing. */}
                <Text style={styles.sectionTitle}>{t('addBranch.kind')}</Text>
                <View style={styles.kindRow}>
                  <SegmentedOption
                    testID="branch-kind-BRANCH"
                    title={t('addBranch.kindBranch')}
                    caption={t('addBranch.kindBranchHint')}
                    icon="storefront-outline"
                    selected={kind === 'BRANCH'}
                    onPress={() => setKind('BRANCH')}
                  />
                  <SegmentedOption
                    testID="branch-kind-WAREHOUSE"
                    title={t('addBranch.kindWarehouse')}
                    caption={t('addBranch.kindWarehouseHint')}
                    icon="cube-outline"
                    selected={kind === 'WAREHOUSE'}
                    onPress={() => setKind('WAREHOUSE')}
                  />
                </View>

                <FormInput
                  testID="branch-name"
                  label={t('addBranch.name')}
                  icon="storefront-outline"
                  placeholder={t('addBranch.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                />
                <FormInput
                  testID="branch-code"
                  label={t('addBranch.code')}
                  hint={t('addBranch.codeHint')}
                  icon="pricetag-outline"
                  placeholder={t('addBranch.codePlaceholder')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={code}
                  onChangeText={setCode}
                />
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="branch-city"
                      label={t('addBranch.city')}
                      icon="location-outline"
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="branch-region"
                      label={t('addBranch.region')}
                      icon="map-outline"
                      value={region}
                      onChangeText={setRegion}
                    />
                  </View>
                </View>
                {/* Full width and multi-line: this is what a delivery agent
                    reads to find the place, and the landmark is usually the
                    half that does it. The placeholder carries the shape, since
                    the label's `hint` slot is sized for one word — the full
                    explanation lives on Branch settings, which has room for a
                    sentence. */}
                <FormInput
                  testID="branch-address"
                  label={t('branchSettings.address')}
                  hint={t('addStaff.optional')}
                  icon="navigate-circle-outline"
                  placeholder={t('branchSettings.addressPlaceholder')}
                  multiline
                  value={addressLine}
                  onChangeText={setAddressLine}
                />
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="branch-postal-code"
                      label={t('branchSettings.postalCode')}
                      icon="mail-outline"
                      keyboardType="number-pad"
                      value={postalCode}
                      onChangeText={setPostalCode}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      label={t('addBranch.currency')}
                      icon="cash-outline"
                      autoCapitalize="characters"
                      value={currency}
                      onChangeText={setCurrency}
                    />
                  </View>
                </View>
                <FormInput
                  label={t('addBranch.timezone')}
                  icon="time-outline"
                  value={timezone}
                  onChangeText={setTimezone}
                />
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)} style={styles.optionalWrap}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('branchSettings.geofence')}</Text>
                <Text style={styles.sectionHint}>{t('addBranch.geofenceHint')}</Text>

                <PressableScale
                  testID="add-branch-use-location"
                  style={styles.secondaryAction}
                  scaleTo={0.98}
                  disabled={isLocating}
                  onPress={() => void handleUseCurrentLocation()}
                >
                  <Ionicons name="locate-outline" size={16} color={colors.primary} />
                  <Text style={styles.secondaryActionText}>
                    {isLocating ? t('branchSettings.locating') : t('branchSettings.useCurrentLocation')}
                  </Text>
                </PressableScale>

                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-branch-latitude"
                      label={t('errors.field.latitude')}
                      icon="navigate-outline"
                      value={latitude}
                      onChangeText={setLatitude}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-branch-longitude"
                      label={t('errors.field.longitude')}
                      icon="navigate-outline"
                      value={longitude}
                      onChangeText={setLongitude}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <FormInput
                  testID="add-branch-radius"
                  label={t('branchSettings.geofenceRadius')}
                  icon="resize-outline"
                  value={radius}
                  onChangeText={setRadius}
                  keyboardType="number-pad"
                />

                {radiusNeedsCoordinates ? (
                  <Text style={styles.warn}>{t('branchSettings.radiusNeedsLocation')}</Text>
                ) : null}
                {!radiusIsValid ? (
                  <Text style={styles.warn}>{t('errors.validation.GEOFENCE_RADIUS_POSITIVE')}</Text>
                ) : null}
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(3)} style={styles.submitWrap}>
              <PrimaryButton
                testID="branch-submit"
                title={isSubmitting ? t('addBranch.submitting') : t('addBranch.submit')}
                icon="arrow-forward"
                loading={isSubmitting}
                disabled={!canSubmit}
                onPress={handleSubmit}
              />
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  optionalWrap: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  sectionHint: {
    fontSize: 12.5,
    color: colors.textTertiary,
    marginTop: 4,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  warn: { fontSize: 12.5, color: colors.warning, marginTop: spacing.xs },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryActionText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  // Two chips share the width evenly, which is what SegmentedOption is built
  // for — and two is comfortably inside the three it stops working past.
  kindRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  rowItem: { flex: 1 },
  submitWrap: { marginTop: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
