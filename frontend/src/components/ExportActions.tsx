import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { extractErrorMessage } from '@/api/client';
import { haptics } from '@/utils/haptics';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { formatAmount } from '@/utils/format';
import type { ExportOverlap, ExportReport } from '@/types/export';

/**
 * "Export everything entered" — requirement 17, as a control.
 *
 * ## Stacked rows, not a row of buttons
 *
 * Two side-by-side buttons is the shape that breaks in Gujarati, where both
 * labels run longer than the English. Rows stack, so each action gets the full
 * width for a label *and* a sentence saying what the file is — which matters here
 * because "spreadsheet" and "printable summary" are not self-evidently different
 * to someone who just wants "the day's figures". A third format later costs height
 * rather than breaking the layout.
 *
 * ## It says what it will export before you press
 *
 * The count comes from the JSON endpoint the parent already fetched, so the card
 * can say "nothing was entered" instead of handing over an empty spreadsheet —
 * and can show the double-count warning *before* the file is made rather than
 * leaving it to be discovered inside it.
 *
 * The warning is rendered from `code` and `params`, so it reads in the device's
 * language. Only the printable document renders it as server-side prose, because
 * a printed page cannot hold a translation key.
 */

type Props = {
  /** Null while loading, which disables the actions without hiding them. */
  report: ExportReport | null;
  /** The period, already formatted by the parent, which owns the date cursor. */
  periodLabel: string;
  onExportWorkbook: () => Promise<void>;
  onExportDocument: () => Promise<void>;
};

/**
 * How many records the export would contain — a voided token included, because it
 * is a record that happened and the file lists it.
 */
function recordCount(report: ExportReport): number {
  const totals = report.totals;
  return (
    totals.counterOrderCount +
    totals.counterVoidCount +
    totals.supplyOrderCount +
    totals.expenseCount +
    totals.staffMarked +
    (totals.payslipCount ?? 0)
  );
}

export default function ExportActions({ report, periodLabel, onExportWorkbook, onExportDocument }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'workbook' | 'document' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = report ? recordCount(report) : 0;
  const isEmpty = !!report && count === 0;

  async function run(which: 'workbook' | 'document', action: () => Promise<void>) {
    if (busy) return;
    haptics.select();
    setBusy(which);
    setError(null);
    try {
      await action();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('exports.title')}</Text>

      <Text style={styles.scope}>
        {report
          ? isEmpty
            ? t('exports.nothingToExport', { period: periodLabel })
            : t('exports.recordCount', { count, period: periodLabel })
          : t('exports.loading')}
      </Text>

      {report && report.overlaps.length > 0 ? (
        <View style={styles.warning}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
          <View style={styles.warningText}>
            <Text style={styles.warningTitle}>{t('exports.worthChecking')}</Text>
            {report.overlaps.map((overlap) => (
              <Text key={overlap.expenseId} style={styles.warningBody}>
                {t(OVERLAP_KEYS[overlap.code], {
                  category: overlap.params.category,
                  amount: formatAmount(Number(overlap.params.amount), report.business.currency),
                  orderNumber: overlap.params.orderNumber,
                  date: overlap.params.date,
                })}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <ActionRow
        icon="grid-outline"
        title={t('exports.spreadsheet')}
        description={t('exports.spreadsheetHint')}
        busy={busy === 'workbook'}
        disabled={!report || isEmpty || busy !== null}
        testID="export-workbook"
        onPress={() => void run('workbook', onExportWorkbook)}
      />
      <ActionRow
        icon="print-outline"
        title={t('exports.printable')}
        description={t('exports.printableHint')}
        busy={busy === 'document'}
        disabled={!report || isEmpty || busy !== null}
        testID="export-document"
        onPress={() => void run('document', onExportDocument)}
        divided
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * A `Record` over the codes rather than a switch, so a code added on the server
 * fails `tsc` here until somebody writes its sentence — instead of rendering the
 * raw code to a person who has no idea what it means.
 */
const OVERLAP_KEYS: Record<ExportOverlap['code'], 'exports.overlapExpenseMatchesSupplyOrder'> = {
  EXPENSE_MATCHES_SUPPLY_ORDER: 'exports.overlapExpenseMatchesSupplyOrder',
};

function ActionRow({
  icon,
  title,
  description,
  busy,
  disabled,
  onPress,
  testID,
  divided,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
  divided?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divided && styles.rowDivided,
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      {/* flex: 1 so the label and its sentence take the width, and the trailing
          icon is never squeezed by a long translation. */}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  scope: { fontSize: 12.5, color: colors.textTertiary, marginTop: 2, marginBottom: spacing.sm },
  warning: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#FDF3E3',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  warningText: { flex: 1 },
  warningTitle: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  warningBody: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  rowPressed: { opacity: 0.6 },
  rowDisabled: { opacity: 0.4 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowDescription: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  error: { fontSize: 12.5, color: colors.error, marginTop: spacing.sm },
});
