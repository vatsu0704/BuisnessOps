import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IoBluetoothOutline,
  IoCheckmarkCircle,
  IoDocumentTextOutline,
  IoInformationCircleOutline,
  IoPrintOutline,
} from 'react-icons/io5';
import { buildTestReceipt, columnsFor, previewReceipt, type PaperWidth } from '@shared/utils/receipt';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ChoiceTile from '@/components/ui/ChoiceTile';
import Enter from '@/components/ui/Enter';
import OptionRow from '@/components/ui/OptionRow';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Toggle from '@/components/ui/Toggle';
import { useBranches } from '@/hooks/useBranches';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { usePrinterStore } from '@/store/printerStore';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import { choosePrinter, forgetPrinter, hasChosenPrinter, printBytes, printerErrorKey, serialSupport } from '@/utils/printer';
import { printHtml } from '@/utils/printHtml';
import { receiptHtml } from '@/utils/receiptHtml';
import styles from './ReceiptPrinterPage.module.css';

const PAPERS: PaperWidth[] = [58, 80];

/**
 * How this browser prints tokens (requirement 31) — the app's Receipt printer
 * screen, with the web's two ways to print.
 *
 * Straight to the Bluetooth printer through Web Serial in Chrome or Edge: paired
 * once in the system's Bluetooth settings, chosen once here in the browser's own
 * chooser, then every token prints by itself. Or through the print dialog, which
 * any browser and any printer the computer has can do, a dialog per token.
 *
 * Then the paper, whether tokens print by themselves, a test, and a preview laid
 * out by the same code the printer gets. These are settings of this browser, so
 * they are kept in it, not on an account.
 */
export default function ReceiptPrinterPage() {
  const { t } = useTranslation();
  const business = useAuthStore((s) => s.business);
  const { tradingBranches } = useBranches();
  const { method, paperWidth, autoPrint, setMethod, setPaperWidth, setAutoPrint } = usePrinterStore();

  const support = serialSupport();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const readPorts = useCallback(async () => {
    setChosen(await hasChosenPrinter().catch(() => false));
  }, []);
  useRefreshOnFocus(readPorts);

  async function handleChoose() {
    setNotice(null);
    try {
      if (await choosePrinter()) {
        setMethod('bluetooth');
        setChosen(true);
      }
    } catch (err) {
      setNotice({ tone: 'bad', text: t(printerErrorKey(err)) });
    }
  }

  async function handleForget() {
    await forgetPrinter();
    setChosen(false);
    setNotice(null);
  }

  // The preview is a real receipt laid out by the same code the printer gets. Its
  // sample items are translated on purpose: in Gujarati they come out as "Item 1",
  // which is exactly what the printer does with a Gujarati name.
  const preview = useMemo(() => {
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

  async function handleTest() {
    setBusy(true);
    setNotice(null);
    try {
      if (method === 'dialog') {
        await printHtml(receiptHtml(preview, paperWidth));
        setNotice({ tone: 'good', text: t('web.printer.testDialog') });
      } else {
        await printBytes(buildTestReceipt(columnsFor(paperWidth)));
        setNotice({ tone: 'good', text: t('printer.testPrinted') });
      }
    } catch (err) {
      setNotice({ tone: 'bad', text: t(printerErrorKey(err)) });
    } finally {
      setBusy(false);
    }
  }

  const bluetoothReason =
    support === 'insecure' ? t('web.printer.insecureSerial') : support === 'unsupported' ? t('web.printer.unsupportedSerial') : null;
  const canTest = method === 'dialog' || (method === 'bluetooth' && support === 'supported' && chosen === true);

  return (
    <div className={styles.page}>
      <PageHeader title={t('printer.title')} subtitle={t('web.printer.subtitle')} backTo={pathTo('counter')} />

      <div className={styles.layout}>
        <div className={styles.column}>
          <Enter delay={step(1)}>
            <Card>
              <fieldset className={fieldStyles.fieldset}>
                <legend className={fieldStyles.heading}>{t('web.printer.methodSection')}</legend>
                <div className={fieldStyles.legendGap} />
                <div className={fieldStyles.modelList}>
                  <OptionRow
                    name="print-method"
                    value="bluetooth"
                    icon={IoBluetoothOutline}
                    title={t('web.printer.methodBluetooth')}
                    description={bluetoothReason ?? t('web.printer.methodBluetoothHint')}
                    selected={method === 'bluetooth'}
                    onSelect={() => setMethod('bluetooth')}
                    disabled={support !== 'supported'}
                  />
                  <OptionRow
                    name="print-method"
                    value="dialog"
                    icon={IoDocumentTextOutline}
                    title={t('web.printer.methodDialog')}
                    description={t('web.printer.methodDialogHint')}
                    selected={method === 'dialog'}
                    onSelect={() => setMethod('dialog')}
                  />
                </div>
              </fieldset>
            </Card>
          </Enter>

          {method === 'bluetooth' && support === 'supported' ? (
            <Enter delay={step(2)}>
              <Card title={t('printer.pairedSection')}>
                <p className={styles.hint}>{t('web.printer.pairHint')}</p>
                <p className={cx(styles.status, chosen && styles.statusGood)}>
                  {chosen ? <IoCheckmarkCircle size={17} aria-hidden="true" /> : <IoInformationCircleOutline size={17} aria-hidden="true" />}
                  {chosen ? t('web.printer.chosen') : t('web.printer.notChosen')}
                </p>
                <div className={styles.actions}>
                  <PrimaryButton
                    type="button"
                    title={chosen ? t('web.printer.chooseAgain') : t('web.printer.choose')}
                    icon={IoBluetoothOutline}
                    onClick={() => void handleChoose()}
                  />
                  {chosen ? (
                    <Button type="button" variant="danger" title={t('web.printer.forget')} onClick={() => void handleForget()} />
                  ) : null}
                </div>
              </Card>
            </Enter>
          ) : null}

          {method === 'dialog' ? (
            <Enter delay={step(2)}>
              <p className={styles.tip}>
                <IoInformationCircleOutline size={16} aria-hidden="true" />
                <span>{t('web.printer.kioskTip')}</span>
              </p>
            </Enter>
          ) : null}

          <Enter delay={step(3)}>
            <Card>
              <fieldset className={fieldStyles.fieldset}>
                <legend className={fieldStyles.heading}>{t('printer.paperSection')}</legend>
                <p className={fieldStyles.hint}>{t('printer.paperHint')}</p>
                <div className={styles.papers}>
                  {PAPERS.map((paper) => (
                    <ChoiceTile
                      key={paper}
                      name="paper-width"
                      value={String(paper)}
                      title={t(paper === 58 ? 'printer.paper58' : 'printer.paper80')}
                      caption={t('printer.columns', { count: columnsFor(paper) })}
                      selected={paperWidth === paper}
                      onSelect={() => setPaperWidth(paper)}
                    />
                  ))}
                </div>
              </fieldset>
              {/* The words beside the switch: the switch itself carries them only for a screen reader. */}
              <div className={styles.toggle}>
                <div className={styles.toggleText}>
                  <p className={styles.toggleTitle}>{t('printer.autoPrint')}</p>
                  <p className={styles.hint}>{t('printer.autoPrintHint')}</p>
                </div>
                <Toggle label={t('printer.autoPrint')} checked={autoPrint} onChange={setAutoPrint} />
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  title={t('printer.testPrint')}
                  icon={IoPrintOutline}
                  loading={busy}
                  disabled={!canTest}
                  onClick={() => void handleTest()}
                />
              </div>
              {!method ? <p className={styles.hint}>{t('printer.chooseFirst')}</p> : null}
              {notice ? (
                <p className={cx(styles.notice, notice.tone === 'bad' && styles.noticeBad)} role="status">
                  {notice.text}
                </p>
              ) : null}
            </Card>
          </Enter>
        </div>

        <Enter delay={step(4)}>
          <Card title={t('printer.previewSection')}>
            <p className={styles.hint}>{t('printer.previewHint')}</p>
            <div className={styles.paperWrap}>
              <div className={styles.paper} style={{ '--columns': columnsFor(paperWidth) } as CSSProperties}>
                {preview.map((row, index) => (
                  <div
                    // Rows are positional and never reorder.
                    key={index}
                    className={cx(styles.paperLine, row.bold && styles.paperBold)}
                    style={{ '--scale': row.tall ?? 1, textAlign: row.align ?? 'left' } as CSSProperties}
                  >
                    {row.text || ' '}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Enter>
      </div>
    </div>
  );
}
