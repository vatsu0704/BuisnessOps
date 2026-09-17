import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { createBranch } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddBranch'>;

export default function AddBranchScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const business = useAuthStore((s) => s.business);
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [timezone, setTimezone] = useState(business?.timezone ?? 'Asia/Kolkata');
  const [currency, setCurrency] = useState(business?.defaultCurrency ?? 'INR');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !!businessId &&
    name.trim().length > 0 &&
    code.trim().length > 0 &&
    timezone.trim().length > 0 &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createBranch(businessId, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        timezone: timezone.trim(),
        city: city.trim() || undefined,
        region: region.trim() || undefined,
        country: business?.country,
        currency: currency.trim() || undefined,
      });
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
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FormInput
                      label={t('addBranch.currency')}
                      icon="cash-outline"
                      autoCapitalize="characters"
                      value={currency}
                      onChangeText={setCurrency}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      label={t('addBranch.timezone')}
                      icon="time-outline"
                      value={timezone}
                      onChangeText={setTimezone}
                    />
                  </View>
                </View>
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)} style={styles.submitWrap}>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
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
