import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { ensureBranchDataSource, uploadFile, type PickedFile, type UploadResult } from '@/api/dataSource';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { saveSalesTemplate } from '@/utils/saveTemplate';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { useBusinessId } from '@/hooks/useBusinessId';

type Props = NativeStackScreenProps<AppStackParamList, 'Upload'>;

const ACCEPTED = [
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export default function UploadScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { branches, isLoading } = useBranches();

  const [branchId, setBranchId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const branch = branches.find((b) => b.id === branchId) ?? null;
  const canUpload = !!businessId && !!branch && !!picked && !isUploading;

  async function handleTemplate() {
    try {
      haptics.tap();
      await saveSalesTemplate();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handlePick() {
    const outcome = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true });
    if (outcome.canceled || !outcome.assets?.length) return;
    const asset = outcome.assets[0];
    setResult(null);
    setError(null);
    setPicked({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      file: (asset as { file?: File }).file,
    });
  }

  async function handleUpload() {
    if (!canUpload || !businessId || !branch || !picked) return;
    setIsUploading(true);
    setError(null);
    setResult(null);
    try {
      const dataSource = await ensureBranchDataSource(businessId, branch.id, branch.name);
      const uploaded = await uploadFile(businessId, dataSource.id, picked);
      setResult(uploaded);
      if (uploaded.recordsFailed > 0) haptics.error();
      else haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('upload.title')}</Text>
          <PressableScale testID="upload-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AnimatedEntrance delay={step(0)}>
            <Text style={styles.subtitle}>{t('upload.subtitle')}</Text>
          </AnimatedEntrance>

          <AnimatedEntrance delay={step(1)} style={styles.templateBlock}>
            <InfoCard
              testID="upload-download-template"
              icon="download-outline"
              title={t('upload.templateTitle')}
              subtitle={t('upload.templateSubtitle')}
              onPress={() => void handleTemplate()}
            />
          </AnimatedEntrance>

          {!isLoading && branches.length === 0 ? (
            <AnimatedEntrance delay={step(1)}>
              <InfoCard
                testID="upload-no-branches"
                icon="storefront-outline"
                title={t('upload.noBranchesTitle')}
                subtitle={t('upload.noBranchesSubtitle')}
                onPress={() => navigation.replace('AddBranch')}
              />
            </AnimatedEntrance>
          ) : null}

          {branches.length > 0 ? (
            <>
              <AnimatedEntrance delay={step(1)}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('upload.branchSection')}</Text>
                  <View style={styles.grid}>
                    {branches.map((b) => (
                      <View key={b.id} style={styles.gridItem}>
                        <SegmentedOption
                          testID={`upload-branch-${b.code}`}
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
                  <Text style={styles.sectionTitle}>{t('upload.fileSection')}</Text>

                  <PressableScale testID="upload-pick" style={styles.dropZone} onPress={() => void handlePick()}>
                    <Ionicons
                      name={picked ? 'document-text' : 'cloud-upload-outline'}
                      size={26}
                      color={colors.primary}
                    />
                    <Text style={styles.dropTitle}>{picked ? picked.name : t('upload.pick')}</Text>
                    <Text style={styles.dropHint}>{picked ? t('upload.pickChange') : t('upload.pickHint')}</Text>
                  </PressableScale>

                  <View style={styles.columns}>
                    <Text style={styles.columnsLabel}>{t('upload.columnsLabel')}</Text>
                    <Text style={styles.columnsMono}>
                      occurred_at, product_name, quantity, unit_price, payment_method
                    </Text>
                    <Text style={styles.columnsHint}>{t('upload.columnsOptional')}</Text>
                  </View>
                </View>
              </AnimatedEntrance>

              {error ? (
                <AnimatedEntrance key={error} delay={0} distance={-8} style={styles.block}>
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                </AnimatedEntrance>
              ) : null}

              {result ? (
                <AnimatedEntrance delay={0} style={styles.block}>
                  <View style={[styles.card, styles.resultCard]}>
                    <View style={styles.resultHead}>
                      <Ionicons
                        name={result.recordsFailed === 0 ? 'checkmark-circle' : 'warning'}
                        size={20}
                        color={result.recordsFailed === 0 ? colors.success : colors.warning}
                      />
                      <Text style={styles.resultTitle}>
                        {result.recordsFailed === 0 ? t('upload.doneTitle') : t('upload.partialTitle')}
                      </Text>
                    </View>

                    <View style={styles.statRow}>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{result.transactionsCreated}</Text>
                        <Text style={styles.statLabel}>{t('upload.created')}</Text>
                      </View>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{result.transactionsUpdated}</Text>
                        <Text style={styles.statLabel}>{t('upload.updated')}</Text>
                      </View>
                      <View style={styles.stat}>
                        <Text style={[styles.statValue, result.recordsFailed > 0 && styles.statValueBad]}>
                          {result.recordsFailed}
                        </Text>
                        <Text style={styles.statLabel}>{t('upload.failed')}</Text>
                      </View>
                    </View>

                    {result.errors.length ? (
                      <View style={styles.rowErrors}>
                        <Text style={styles.rowErrorsLabel}>{t('upload.rowErrors')}</Text>
                        {result.errors.slice(0, 5).map((message) => (
                          <Text key={message} style={styles.rowErrorText}>
                            • {message}
                          </Text>
                        ))}
                        {result.errors.length > 5 ? (
                          <Text style={styles.rowErrorMore}>
                            {t('common.more', { count: result.errors.length - 5 })}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </AnimatedEntrance>
              ) : null}

              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <PrimaryButton
                  testID="upload-submit"
                  title={isUploading ? t('upload.uploading') : t('upload.submit')}
                  icon="arrow-up"
                  loading={isUploading}
                  disabled={!canUpload}
                  onPress={handleUpload}
                />
              </AnimatedEntrance>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
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
  templateBlock: { marginBottom: spacing.lg },
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
  dropZone: {
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  dropTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text, textAlign: 'center' },
  dropHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  columns: { marginTop: spacing.lg, backgroundColor: '#FAFAFC', borderRadius: radius.md, padding: spacing.md },
  columnsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  columnsMono: { fontSize: 11.5, color: colors.text, marginTop: spacing.xs, lineHeight: 17 },
  columnsHint: { fontSize: 11.5, color: colors.textTertiary, marginTop: spacing.xs },
  resultCard: { gap: spacing.md },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultTitle: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: '#FAFAFC',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  statValueBad: { color: colors.error },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  rowErrors: { backgroundColor: colors.errorBg, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  rowErrorsLabel: { fontSize: 11, fontWeight: '700', color: colors.error, textTransform: 'uppercase' },
  rowErrorText: { fontSize: 12, color: colors.error, lineHeight: 17 },
  rowErrorMore: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
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
