import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import { colors, radius, spacing } from '@/theme';

/**
 * What goes in each column of the sales template, in the reader's language.
 *
 * The template itself is a CSV, which can carry sample rows but not a sentence
 * of explanation — and anything written into the file would be in one language.
 * So the file shows the formats, and this says what they mean.
 *
 * Collapsed by default: it is read once, before the first upload, and every
 * later visit is to pick a branch and a file.
 *
 * Every part stacks — name, meaning, example — rather than sitting beside
 * another, so a longer Gujarati or Marathi sentence wraps instead of squeezing
 * something else on its line. A column name is a single unbroken word; the
 * longest, transaction_external_id, is about 180dp at 13px monospace, inside
 * the ~240dp this panel has on a 320dp phone.
 */

// Column names are the literal headers in the person's file, so they are the
// same in every language; only what they mean is translated. Required ones
// first, matching the order the server checks them in.
const REQUIRED = [
  { name: 'occurred_at', body: 'upload.guide.occurredAt', example: 'upload.guide.occurredAtExample' },
  { name: 'product_name', body: 'upload.guide.productName', example: 'upload.guide.productNameExample' },
  { name: 'quantity', body: 'upload.guide.quantity', example: 'upload.guide.quantityExample' },
  { name: 'unit_price', body: 'upload.guide.unitPrice', example: 'upload.guide.unitPriceExample' },
  { name: 'payment_method', body: 'upload.guide.paymentMethod', example: 'upload.guide.paymentMethodExample' },
] as const;

const OPTIONAL = [
  { name: 'transaction_external_id', body: 'upload.guide.externalId', example: 'upload.guide.externalIdExample' },
  { name: 'tax_amount', body: 'upload.guide.taxAmount', example: 'upload.guide.taxAmountExample' },
  { name: 'discount_amount', body: 'upload.guide.discountAmount', example: 'upload.guide.discountAmountExample' },
  { name: 'sku', body: 'upload.guide.sku', example: 'upload.guide.skuExample' },
  { name: 'unit', body: 'upload.guide.unit', example: 'upload.guide.unitExample' },
] as const;

const NOTES = ['upload.guide.noteExamples', 'upload.guide.noteDates', 'upload.guide.noteFormats'] as const;

type Column = (typeof REQUIRED)[number] | (typeof OPTIONAL)[number];

// A header reads as something to type exactly as shown, which is what it is.
const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

export default function TemplateGuide() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <InfoCard
        testID="upload-guide-toggle"
        icon="reader-outline"
        title={t('upload.guide.title')}
        subtitle={t('upload.guide.subtitle')}
        expanded={open}
        onPress={() => setOpen((value) => !value)}
      />

      {open ? (
        <AnimatedEntrance distance={-8} style={styles.panel}>
          <Text style={styles.lead}>{t('upload.guide.oneRow')}</Text>

          <ColumnGroup label={t('upload.guide.required')} columns={REQUIRED} />
          <ColumnGroup label={t('upload.guide.optional')} columns={OPTIONAL} />

          <View style={styles.notes}>
            <Text style={styles.groupLabel}>{t('upload.guide.notesTitle')}</Text>
            {NOTES.map((key) => (
              <View key={key} style={styles.note}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.noteText}>{t(key)}</Text>
              </View>
            ))}
          </View>
        </AnimatedEntrance>
      ) : null}
    </View>
  );
}

function ColumnGroup({ label, columns }: { label: string; columns: readonly Column[] }) {
  const { t } = useTranslation();
  return (
    <View>
      <Text style={styles.groupLabel}>{label}</Text>
      {columns.map((column, index) => (
        <View key={column.name} style={[styles.column, index > 0 && styles.columnDivider]}>
          <Text style={styles.columnName}>{column.name}</Text>
          <Text style={styles.columnBody}>{t(column.body)}</Text>
          <Text style={styles.columnExample}>{t('upload.guide.eg', { value: t(column.example) })}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  // Indic scripts carry marks above and below the line, so text here gets
  // roughly 1.5× its size in line height rather than the tighter Latin default.
  lead: { fontSize: 13, color: colors.text, lineHeight: 20 },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  column: { paddingVertical: spacing.sm + 2, gap: 2 },
  columnDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  columnName: { fontFamily: MONOSPACE, fontSize: 13, fontWeight: '700', color: colors.primary },
  columnBody: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 19 },
  columnExample: { fontSize: 12, color: colors.textTertiary, lineHeight: 18 },
  notes: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  note: { flexDirection: 'row', gap: spacing.sm },
  bullet: { fontSize: 12.5, color: colors.primary, lineHeight: 19 },
  noteText: { flex: 1, fontSize: 12.5, color: colors.text, lineHeight: 19 },
});
