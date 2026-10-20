import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import OptionRow from '@/components/OptionRow';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { useAuthStore } from '@/store/authStore';
import { usePrinterStore } from '@/store/printerStore';
import { useBranches } from '@/hooks/useBranches';
import { useScreenEdges } from '@/hooks/useScreenEdges';
import {
  isPrintingSupported,
  listPairedPrinters,
  printBytes,
  printerErrorKey,
  type BondedPrinter,
} from '@/utils/printer';
import { buildTestReceipt, columnsFor, previewReceipt, type ReceiptRow } from '@/utils/receipt';
import { haptics } from '@/utils/haptics';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

/**
 * The counter's receipt printer — which one, what paper, and whether the token
 * prints by itself.
 *
 * The printer is paired once in Android's own Bluetooth settings; this screen
 * only chooses among the paired devices. Searching for printers from inside the
 * app would need the location permission, which a till has no business asking for.
 *
 * Everything here belongs to this phone (see printerStore), so it is never sent
 * to the server and works with no connection at all.
 */
export default function ReceiptPrinterScreen() {
  const edges = useScreenEdges();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const business = useAuthStore((s) => s.business);
  const { tradingBranches } = useBranches();

  const { printer, paperWidth, autoPrint, isLoaded, load, setPrinter, setPaperWidth, setAutoPrint } =
    usePrinterStore();

  const supported = isPrintingSupported();
  const { width: windowWidth } = useWindowDimensions();
  const [devices, setDevices] = useState<BondedPrinter[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshDevices = useCallback(async () => {
    if (!supported) return;
    setIsScanning(true);
    setListError(null);
    try {
      setDevices(await listPairedPrinters());
    } catch (err) {
      setListError(t(printerErrorKey(err)));
    } finally {
      setIsScanning(false);
    }
  }, [supported, t]);

  useFocusEffect(
    useCallback(() => {
      // Coming back from Android's Bluetooth settings is the usual way a newly
      // paired printer arrives, so the list is read again on every focus.
      void refreshDevices();
    }, [refreshDevices])
  );

  async function testPrint() {
    setIsPrinting(true);
    setNotice(null);
    try {
      await printBytes(printer?.address, buildTestReceipt(columnsFor(paperWidth)));
      haptics.success();
      setNotice({ kind: 'ok', text: t('printer.testPrinted') });
    } catch (err) {
      haptics.error();
      setNotice({ kind: 'error', text: t(printerErrorKey(err)) });
    } finally {
      setIsPrinting(false);
    }
  }

  // The preview is a real receipt laid out by the same code the printer gets.
  // Its sample items are translated on purpose: in Gujarati they come out as
  // "Item 1", which is exactly what the printer would do with a Gujarati name.
  const preview = useMemo<ReceiptRow[]>(() => {
    const branch = tradingBranches[0];
    const now = new Date();
    return previewReceipt({
      header: {
        businessName: business?.name ?? '',
        branchName: branch?.name ?? '',
        branchCode: branch?.code ?? '',
        addressLine: branch?.addressLine ?? null,
        phone: branch?.phone ?? null,
      },
      tokenNumber: 27,
      at: {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
      },
      lines: [
        { name: t('printer.sampleItemOne'), quantity: 2, unitPrice: 15, lineTotal: 30 },
        { name: t('printer.sampleItemTwo'), quantity: 1, unitPrice: 40, lineTotal: 40 },
      ],
      total: 70,
      currency: business?.defaultCurrency ?? 'INR',
      paymentMethod: 'UPI',
      columns: columnsFor(paperWidth),
    });
  }, [business, tradingBranches, paperWidth, t]);

  /**
   * The paper's font size, derived from the screen so a whole line of the
   * receipt always fits: 48 columns at 11px is wider than a 320dp phone. A
   * monospace glyph is about 0.62 of its size wide.
   */
  const paperFont = useMemo(() => {
    const room = windowWidth - spacing.xl * 2 - spacing.sm * 2 - 2;
    return Math.min(11, Math.floor((room / (columnsFor(paperWidth) * 0.62)) * 10) / 10);
  }, [windowWidth, paperWidth]);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('printer.title')}</Text>
            <Text style={styles.subtitle}>{t('printer.subtitle')}</Text>
          </View>
          <PressableScale testID="receipt-printer-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            supported ? (
              <RefreshControl refreshing={isScanning} onRefresh={() => void refreshDevices()} tintColor={colors.primary} />
            ) : undefined
          }
        >
          {!supported ? (
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <View style={styles.explainer}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.explainerText}>
                  {Platform.OS === 'android' ? t('printer.needsNewBuild') : t('printer.unsupported')}
                </Text>
              </View>
            </AnimatedEntrance>
          ) : (
            <>
              <AnimatedEntrance delay={step(0)} style={styles.block}>
                <Text style={styles.sectionTitle}>{t('printer.pairedSection')}</Text>
                <Text style={styles.sectionHint}>{t('printer.pairHint')}</Text>
                <PressableScale
                  testID="receipt-printer-bluetooth-settings"
                  style={styles.linkRow}
                  onPress={() => void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(() => undefined)}
                >
                  <Ionicons name="bluetooth-outline" size={16} color={colors.primary} />
                  <Text style={styles.linkText}>{t('printer.openBluetoothSettings')}</Text>
                </PressableScale>

                {listError ? (
                  <View style={[styles.banner, styles.bannerError]}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={[styles.bannerText, styles.bannerTextError]}>{listError}</Text>
                  </View>
                ) : null}

                <View style={styles.list}>
                  {devices.length === 0 && !listError && !isScanning ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>{t('printer.noneTitle')}</Text>
                      <Text style={styles.emptyBody}>{t('printer.noneBody')}</Text>
                    </View>
                  ) : null}
                  {devices.map((device) => (
                    <OptionRow
                      key={device.address}
                      testID={`receipt-printer-device-${device.address}`}
                      icon="print-outline"
                      title={device.name || device.address}
                      description={device.address}
                      selected={printer?.address === device.address}
                      onPress={() => void setPrinter({ address: device.address, name: device.name })}
                    />
                  ))}
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(1)} style={styles.block}>
                <Text style={styles.sectionTitle}>{t('printer.paperSection')}</Text>
                <Text style={styles.sectionHint}>{t('printer.paperHint')}</Text>
                <View style={styles.segmented}>
                  <SegmentedOption
                    testID="receipt-printer-paper-58"
                    title={t('printer.paper58')}
                    caption={t('printer.columns', { count: 32 })}
                    selected={paperWidth === 58}
                    onPress={() => void setPaperWidth(58)}
                  />
                  <SegmentedOption
                    testID="receipt-printer-paper-80"
                    title={t('printer.paper80')}
                    caption={t('printer.columns', { count: 48 })}
                    selected={paperWidth === 80}
                    onPress={() => void setPaperWidth(80)}
                  />
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.switchRow}>
                  <View style={styles.switchText}>
                    <Text style={styles.switchTitle}>{t('printer.autoPrint')}</Text>
                    <Text style={styles.switchHint}>{t('printer.autoPrintHint')}</Text>
                  </View>
                  <Switch
                    testID="receipt-printer-auto"
                    value={autoPrint}
                    disabled={!isLoaded}
                    onValueChange={(next) => void setAutoPrint(next)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.white}
                  />
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <PrimaryButton
                  testID="receipt-printer-test"
                  title={t('printer.testPrint')}
                  icon="print-outline"
                  loading={isPrinting}
                  disabled={!printer || isPrinting}
                  onPress={() => void testPrint()}
                />
                {!printer ? <Text style={styles.sectionHint}>{t('printer.chooseFirst')}</Text> : null}
                {notice ? (
                  <View style={[styles.banner, notice.kind === 'ok' ? styles.bannerOk : styles.bannerError]}>
                    <Ionicons
                      name={notice.kind === 'ok' ? 'checkmark-circle' : 'alert-circle'}
                      size={16}
                      color={notice.kind === 'ok' ? colors.success : colors.error}
                    />
                    <Text style={[styles.bannerText, notice.kind === 'ok' ? styles.bannerTextOk : styles.bannerTextError]}>
                      {notice.text}
                    </Text>
                  </View>
                ) : null}
              </AnimatedEntrance>
            </>
          )}

          <AnimatedEntrance delay={step(4)} style={styles.block}>
            <Text style={styles.sectionTitle}>{t('printer.previewSection')}</Text>
            <Text style={styles.sectionHint}>{t('printer.previewHint')}</Text>
            <View style={styles.paper}>
              {preview.map((row, index) => (
                <Text
                  // Rows are positional and never reorder.
                  key={index}
                  style={[
                    styles.paperLine,
                    row.bold ? styles.paperBold : null,
                    {
                      fontSize: paperFont * (row.tall ?? 1),
                      lineHeight: Math.round(paperFont * 1.3 * (row.tall ?? 1)),
                      textAlign: row.align ?? 'left',
                    },
                  ]}
                >
                  {row.text || ' '}
                </Text>
              ))}
            </View>
          </AnimatedEntrance>
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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  linkText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  list: { gap: spacing.sm },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  switchHint: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  bannerOk: { backgroundColor: colors.successBg },
  bannerError: { backgroundColor: colors.errorBg },
  bannerText: { fontSize: 13, flex: 1 },
  bannerTextOk: { color: colors.success },
  bannerTextError: { color: colors.error },
  paper: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadow.sm,
  },
  paperLine: {
    fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
    color: colors.text,
  },
  paperBold: { fontWeight: '700' },
});
