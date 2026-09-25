import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { listBranches, updateBranch, type UpdateBranchPayload } from '@/api/business';
import { refreshBranches } from '@/store/branchStore';
import { extractErrorMessage } from '@/api/client';
import type { Branch, BranchKind } from '@/types/branch';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { getCurrentCoords } from '@/utils/location';
import { useBusinessId } from '@/hooks/useBusinessId';

type Props = NativeStackScreenProps<AppStackParamList, 'BranchSettings'>;

/**
 * Timezone and punch-in geofence for one branch.
 *
 * `PATCH /branches/:branchId` has existed since the payroll rebuild and
 * nothing in the app ever called it, so both of these were write-once at
 * creation — and the Add Branch form never captured coordinates, which meant
 * no branch could have a geofence at all without going through the API by
 * hand. The translations for this screen were written at the same time as the
 * endpoint and sat unused in all four locale files until now.
 *
 * The timezone matters beyond attendance: it decides which calendar day a
 * punch near midnight belongs to, and therefore which month it is paid in.
 */
export default function BranchSettingsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { branchId } = route.params;

  const [branch, setBranch] = useState<Branch | null>(null);
  const [kind, setKind] = useState<BranchKind>('BRANCH');
  const [timezone, setTimezone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      // No single-branch GET is exposed to non-owner roles without branch
      // access, and this screen is owner/admin-only anyway, so the list is
      // both sufficient and one request.
      const found = (await listBranches(businessId)).find((b) => b.id === branchId) ?? null;
      setBranch(found);
      if (found) {
        setKind(found.kind);
        setTimezone(found.timezone);
        setAddressLine(found.addressLine ?? '');
        setPostalCode(found.postalCode ?? '');
        setLatitude(found.latitude ?? '');
        setLongitude(found.longitude ?? '');
        setRadius(found.geofenceRadiusMeters === null ? '' : String(found.geofenceRadiusMeters));
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUseCurrentLocation() {
    haptics.tap();
    setIsLocating(true);
    setError(null);
    const coords = await getCurrentCoords();
    setIsLocating(false);
    if (!coords) {
      // The person asked for this explicitly, so silence would read as the
      // button being broken.
      haptics.error();
      setError(t('branchSettings.locationUnavailable'));
      return;
    }
    // Six decimal places is what the column stores (Decimal(9,6)) — roughly
    // 0.1m, far finer than any phone's fix.
    setLatitude(coords.latitude.toFixed(6));
    setLongitude(coords.longitude.toFixed(6));
    haptics.success();
  }

  function handleClearGeofence() {
    haptics.tap();
    setRadius('');
  }

  const parsedRadius = radius.trim() === '' ? null : Number(radius);
  const hasCoordinates = latitude.trim() !== '' && longitude.trim() !== '';
  // Mirrors the server's rule rather than discovering it through a 400: a
  // radius with no coordinates would never enforce anything.
  const radiusNeedsCoordinates = parsedRadius !== null && !hasCoordinates;
  const radiusIsValid = parsedRadius === null || (Number.isFinite(parsedRadius) && parsedRadius > 0);

  const canSave =
    !!businessId && !!branch && timezone.trim() !== '' && radiusIsValid && !radiusNeedsCoordinates && !isSaving;

  async function handleSave() {
    if (!canSave || !businessId) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload: UpdateBranchPayload = {
        kind,
        timezone: timezone.trim(),
        // Emptied means cleared, the same way the geofence fields below work —
        // an address someone deleted has to actually go.
        addressLine: addressLine.trim() || null,
        postalCode: postalCode.trim() || null,
        // null is meaningful to the backend — it clears the value — which is
        // how "turn off geofencing" and "forget this location" are expressed.
        latitude: hasCoordinates ? Number(latitude) : null,
        longitude: hasCoordinates ? Number(longitude) : null,
        geofenceRadiusMeters: parsedRadius,
      };
      await updateBranch(businessId, branch!.id, payload);
      // A renamed or re-zoned branch is read by every branch picker in the app,
      // all of which share one list — refresh it before leaving.
      await refreshBranches();
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {branch?.name ?? t('branchSettings.title')}
            </Text>
            <PressableScale
              testID="branch-settings-close"
              style={styles.close}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error ? (
              <AnimatedEntrance key={error} delay={0} distance={-8}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {isLoading ? <Text style={styles.muted}>{t('common.loading')}</Text> : null}

            {!isLoading && !branch ? <Text style={styles.muted}>{t('branchSettings.notFound')}</Text> : null}

            {branch ? (
              <>
                {/* Changeable, not write-once: a location created as the
                    wrong kind would otherwise be stuck as one, and the only
                    way back would be a second location and a staff transfer. */}
                <AnimatedEntrance delay={step(0)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('addBranch.kind')}</Text>
                    <Text style={styles.hint}>{t('branchSettings.kindHint')}</Text>
                    <View style={styles.kindRow}>
                      <SegmentedOption
                        testID="branch-settings-kind-BRANCH"
                        title={t('addBranch.kindBranch')}
                        icon="storefront-outline"
                        selected={kind === 'BRANCH'}
                        onPress={() => setKind('BRANCH')}
                      />
                      <SegmentedOption
                        testID="branch-settings-kind-WAREHOUSE"
                        title={t('addBranch.kindWarehouse')}
                        icon="cube-outline"
                        selected={kind === 'WAREHOUSE'}
                        onPress={() => setKind('WAREHOUSE')}
                      />
                    </View>
                  </View>
                </AnimatedEntrance>

                <AnimatedEntrance delay={step(0)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('branchSettings.timezone')}</Text>
                    <Text style={styles.hint}>{t('branchSettings.timezoneHint')}</Text>
                    <FormInput
                      testID="branch-settings-timezone"
                      label={t('branchSettings.timezone')}
                      icon="time-outline"
                      value={timezone}
                      onChangeText={setTimezone}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </AnimatedEntrance>

                {/* The delivery address, next to the coordinates rather than
                    with the reporting fields: both answer "where is this
                    branch", and a rider reads one while the geofence checks the
                    other. */}
                <AnimatedEntrance delay={step(1)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('branchSettings.address')}</Text>
                    <Text style={styles.hint}>{t('branchSettings.addressHint')}</Text>
                    <FormInput
                      testID="branch-settings-address"
                      label={t('branchSettings.address')}
                      icon="navigate-circle-outline"
                      placeholder={t('branchSettings.addressPlaceholder')}
                      multiline
                      value={addressLine}
                      onChangeText={setAddressLine}
                    />
                    <FormInput
                      testID="branch-settings-postal-code"
                      label={t('branchSettings.postalCode')}
                      icon="mail-outline"
                      keyboardType="number-pad"
                      value={postalCode}
                      onChangeText={setPostalCode}
                    />
                  </View>
                </AnimatedEntrance>

                <AnimatedEntrance delay={step(2)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('branchSettings.geofence')}</Text>
                    <Text style={styles.hint}>{t('branchSettings.geofenceHint')}</Text>

                    <Text style={styles.subLabel}>{t('branchSettings.coordinates')}</Text>
                    <View style={styles.coordRow}>
                      <View style={styles.coordField}>
                        <FormInput
                          testID="branch-settings-latitude"
                          label={t('errors.field.latitude')}
                          icon="navigate-outline"
                          value={latitude}
                          onChangeText={setLatitude}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.coordField}>
                        <FormInput
                          testID="branch-settings-longitude"
                          label={t('errors.field.longitude')}
                          icon="navigate-outline"
                          value={longitude}
                          onChangeText={setLongitude}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <PressableScale
                      testID="branch-settings-use-location"
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

                    <FormInput
                      testID="branch-settings-radius"
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

                    {parsedRadius !== null ? (
                      <PressableScale
                        testID="branch-settings-clear-geofence"
                        style={styles.secondaryAction}
                        scaleTo={0.98}
                        onPress={handleClearGeofence}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={colors.textSecondary} />
                        <Text style={styles.clearText}>{t('branchSettings.clearGeofence')}</Text>
                      </PressableScale>
                    ) : (
                      <Text style={styles.hint}>{t('branchSettings.geofenceOff')}</Text>
                    )}
                  </View>
                </AnimatedEntrance>

                <AnimatedEntrance delay={step(3)} style={styles.block}>
                  <PrimaryButton
                    testID="branch-settings-save"
                    title={isSaving ? t('branchSettings.saving') : t('branchSettings.save')}
                    onPress={() => void handleSave()}
                    disabled={!canSave}
                  />
                </AnimatedEntrance>
              </>
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  block: { marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  kindRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  subLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
  },
  hint: { fontSize: 12.5, color: colors.textTertiary, marginTop: 4, marginBottom: spacing.sm, lineHeight: 17 },
  muted: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.xl },
  warn: { fontSize: 12.5, color: colors.warning, marginTop: spacing.xs },
  coordRow: { flexDirection: 'row', gap: spacing.md },
  coordField: { flex: 1 },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryActionText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  clearText: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
