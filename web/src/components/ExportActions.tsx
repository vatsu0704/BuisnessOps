import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoAlertCircleOutline, IoChevronForward, IoGridOutline, IoPrintOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import Spinner from '@/components/ui/Spinner';
import type { ExportOverlap, ExportReport } from '@/types/export';
import { formatAmount } from '@/utils/format';
import styles from './ExportActions.module.css';

type Props = {
  /** Null while loading, which disables the actions without hiding them. */
  report: ExportReport | null;
  /** The period, already in words — the page owns the date or month. */
  periodLabel: string;
  onExportWorkbook: () => Promise<void>;
  onExportDocument: () => Promise<void>;
};

/** Every record the export holds — a voided token included, because it happened and the file lists it. */
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

/**
 * A `Record` over the codes, so a warning added on the server fails `tsc` here
 * until it has a sentence, rather than showing a person a raw code.
 */
const OVERLAP_KEYS: Record<ExportOverlap['code'], 'exports.overlapExpenseMatchesSupplyOrder'> = {
  EXPENSE_MATCHES_SUPPLY_ORDER: 'exports.overlapExpenseMatchesSupplyOrder',
};

/**
 * "Export everything entered" — requirement 17, the app's `ExportActions`.
 *
 * Says what it would export before anything is pressed: "nothing was entered"
 * instead of an empty spreadsheet, and the double-count warning before the file
 * is made rather than inside it — in the reader's language, from its code. The two
 * formats are stacked rows, each with a sentence saying what the file is, because
 * two buttons side by side is the row that breaks in Gujarati.
 */
export default function ExportActions({ report, periodLabel, onExportWorkbook, onExportDocument }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'workbook' | 'document' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = report ? recordCount(report) : 0;
  const isEmpty = !!report && count === 0;
  const disabled = !report || isEmpty || busy !== null;

  async function run(which: 'workbook' | 'document', action: () => Promise<void>) {
    if (busy) return;
    setBusy(which);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="export-title">
      <h2 id="export-title" className={styles.title}>
        {t('exports.title')}
      </h2>
      <p className={styles.scope}>
        {report
          ? isEmpty
            ? t('exports.nothingToExport', { period: periodLabel })
            : t('exports.recordCount', { count, period: periodLabel })
          : t('exports.loading')}
      </p>

      {report && report.overlaps.length > 0 ? (
        <div className={styles.warning}>
          <IoAlertCircleOutline size={16} aria-hidden="true" />
          <div>
            <p className={styles.warningTitle}>{t('exports.worthChecking')}</p>
            {report.overlaps.map((overlap) => (
              <p key={overlap.expenseId} className={styles.warningBody}>
                {t(OVERLAP_KEYS[overlap.code], {
                  category: overlap.params.category,
                  amount: formatAmount(Number(overlap.params.amount), report.business.currency),
                  orderNumber: overlap.params.orderNumber,
                  date: overlap.params.date,
                })}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.actions}>
        <ActionRow
          icon={IoGridOutline}
          title={t('exports.spreadsheet')}
          description={t('exports.spreadsheetHint')}
          busy={busy === 'workbook'}
          disabled={disabled}
          onClick={() => void run('workbook', onExportWorkbook)}
        />
        <ActionRow
          icon={IoPrintOutline}
          title={t('exports.printable')}
          description={t('exports.printableHint')}
          busy={busy === 'document'}
          disabled={disabled}
          onClick={() => void run('document', onExportDocument)}
        />
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ActionRow({
  icon: Icon,
  title,
  description,
  busy,
  disabled,
  onClick,
}: {
  icon: IconType;
  title: string;
  description: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.row} onClick={onClick} disabled={disabled} aria-busy={busy || undefined}>
      <span className={styles.rowIcon} aria-hidden="true">
        <Icon size={17} />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        <span className={styles.rowHint}>{description}</span>
      </span>
      {busy ? <Spinner size={16} /> : <IoChevronForward size={16} className={styles.chevron} aria-hidden="true" />}
    </button>
  );
}
