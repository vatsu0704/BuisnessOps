import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { createStaffMember } from '@/api/staff';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { isValidEmail, parseOptionalNumber } from '@/utils/validation';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddStaff'>;

export default function AddStaffScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);
  const { branches } = useBranches();

  const [branchId, setBranchId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [email, setEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);
  const baseSalaryParsed = parseOptionalNumber(baseSalary);
  const baseSalaryInvalid = baseSalaryParsed === null;

  const canSubmit =
    !!businessId &&
    !!branchId &&
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    !emailInvalid &&
    !baseSalaryInvalid &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || !businessId || !branchId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createStaffMember(businessId, {
        branchId,
        name: name.trim(),
        role: role.trim(),
        baseSalary: baseSalaryParsed ?? undefined,
        email: emailTrimmed || undefined,
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
            <Text style={styles.title}>{t('addStaff.title')}</Text>
            <PressableScale testID="add-staff-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <Text style={styles.subtitle}>{t('addStaff.subtitle')}</Text>
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
                <Text style={styles.sectionTitle}>{t('addStaff.branchSection')}</Text>
                <View style={styles.grid}>
                  {branches.map((b) => (
                    <View key={b.id} style={styles.gridItem}>
                      <SegmentedOption
                        testID={`add-staff-branch-${b.code}`}
                        title={b.name}
                        caption={[b.code, b.city].filter(Boolean).join(' · ')}
                        icon="storefront-outline"
                        selected={branchId === b.id}
                        onPress={() => setBranchId(b.id)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <View style={styles.card}>
                <FormInput
                  testID="add-staff-name"
                  label={t('addStaff.name')}
                  icon="person-outline"
                  placeholder={t('addStaff.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                />
                <FormInput
                  testID="add-staff-role"
                  label={t('addStaff.role')}
                  icon="briefcase-outline"
                  placeholder={t('addStaff.rolePlaceholder')}
                  value={role}
                  onChangeText={setRole}
                />
                <FormInput
                  testID="add-staff-salary"
                  label={t('addStaff.baseSalary')}
                  hint={t('addStaff.optional')}
                  icon="cash-outline"
                  placeholder={t('addStaff.baseSalaryPlaceholder')}
                  keyboardType="numeric"
                  value={baseSalary}
                  onChangeText={setBaseSalary}
                />
                {baseSalaryInvalid ? <Text style={styles.fieldError}>{t('addStaff.invalidNumber')}</Text> : null}
                <FormInput
                  testID="add-staff-email"
                  label={t('addStaff.email')}
                  hint={t('addStaff.emailHint')}
                  icon="mail-outline"
                  placeholder={t('addStaff.emailPlaceholder')}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                {emailInvalid ? <Text style={styles.fieldError}>{t('addStaff.emailInvalid')}</Text> : null}
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(3)} style={styles.submitWrap}>
              <PrimaryButton
                testID="add-staff-submit"
                title={isSubmitting ? t('addStaff.submitting') : t('addStaff.submit')}
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
  block: { marginTop: spacing.lg },
  fieldError: { fontSize: 12.5, color: colors.error, marginTop: -spacing.sm, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48%' },
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
