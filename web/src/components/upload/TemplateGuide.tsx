import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoChevronDown, IoReaderOutline } from 'react-icons/io5';
import { cx } from '@/utils/cx';
import styles from './TemplateGuide.module.css';

// Column names are the literal headers in the person's file, so they are the same
// in every language; only what they mean is translated. Required ones first, in
// the order the server checks them.
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

/**
 * What goes in each column of the sales template, in the reader's language — the
 * app's `TemplateGuide`. The CSV can carry sample rows but not a sentence of
 * explanation, so the file shows the formats and this says what they mean.
 *
 * Closed until asked for: it is read once, before the first upload. Every part
 * stacks — name, meaning, example — so a long Gujarati sentence wraps rather than
 * squeezing something beside it.
 */
export default function TemplateGuide() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.iconTile} aria-hidden="true">
          <IoReaderOutline size={18} />
        </span>
        <span className={styles.toggleText}>
          <span className={styles.toggleTitle}>{t('upload.guide.title')}</span>
          <span className={styles.toggleSubtitle}>{t('upload.guide.subtitle')}</span>
        </span>
        <IoChevronDown size={18} className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden="true" />
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <p className={styles.lead}>{t('upload.guide.oneRow')}</p>
        <div className={styles.groups}>
          <ColumnGroup label={t('upload.guide.required')} columns={REQUIRED} />
          <ColumnGroup label={t('upload.guide.optional')} columns={OPTIONAL} />
        </div>
        <div className={styles.notes}>
          <p className={styles.groupLabel}>{t('upload.guide.notesTitle')}</p>
          <ul className={styles.noteList}>
            {NOTES.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ColumnGroup({ label, columns }: { label: string; columns: readonly Column[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className={styles.groupLabel}>{label}</p>
      <dl className={styles.columns}>
        {columns.map((column) => (
          <div key={column.name} className={styles.column}>
            <dt className={styles.columnName}>{column.name}</dt>
            <dd className={styles.columnBody}>{t(column.body)}</dd>
            <dd className={styles.columnExample}>{t('upload.guide.eg', { value: t(column.example) })}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
