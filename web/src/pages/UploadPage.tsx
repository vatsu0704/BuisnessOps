import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IoArrowUp,
  IoCheckmarkCircle,
  IoDownloadOutline,
  IoInformationCircleOutline,
  IoStorefrontOutline,
  IoWarning,
} from 'react-icons/io5';
import { SALES_TEMPLATE_CSV, SALES_TEMPLATE_FILENAME } from '@shared/constants/salesTemplate';
import { extractErrorMessage, isTimeout } from '@/api/client';
import { ensureBranchDataSource, uploadFile, type UploadResult } from '@/api/dataSource';
import BranchPicker from '@/components/branches/BranchPicker';
import TemplateGuide from '@/components/upload/TemplateGuide';
import { summariseUpload } from '@/components/upload/uploadSummary';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FileDrop from '@/components/ui/FileDrop';
import InfoCard from '@/components/ui/InfoCard';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import StatTile from '@/components/ui/StatTile';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { canOpenRoute, pathTo } from '@/routes/paths';
import { refreshSalesSummary } from '@/store/salesStore';
import { step } from '@/theme/motion';
import { saveBlob } from '@/utils/downloadApiFile';
import styles from './UploadPage.module.css';

const ACCEPT = [
  '.csv',
  '.xlsx',
  '.xls',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

const EXTENSIONS = /\.(csv|xlsx|xls)$/i;
/** The server's own ceiling (`dataSource.routes.js`), checked first so a large file is not sent to be refused. */
const MAX_BYTES = 5 * 1024 * 1024;
const ROW_ERRORS_SHOWN = 5;

/**
 * Import sales history from a CSV or Excel file into one branch — the app's
 * Upload screen. The file can be chosen or dropped on the page.
 */
export default function UploadPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { tradingBranches: branches, isLoading } = useBranches();

  // Asked, not assumed: data imported into the wrong branch is hard to take back.
  // With one branch there is no wrong answer, so it is chosen already.
  const [chosenBranchId, setChosenBranchId] = useState<string | null>(null);
  const branchId = chosenBranchId ?? (branches.length === 1 ? branches[0].id : null);
  const branch = branches.find((b) => b.id === branchId) ?? null;

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const canUpload = !!businessId && !!branch && !!file && !isUploading;
  const summary = result ? summariseUpload(result, t) : null;

  function chooseFile(chosen: File) {
    setResult(null);
    setError(null);
    // The dialog filters by type and the server by size; a dropped file has been
    // through neither, so both are checked here.
    if (!EXTENSIONS.test(chosen.name)) {
      setFile(null);
      setFileError(t('web.upload.wrongType'));
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setFile(null);
      setFileError(t('web.upload.tooLarge'));
      return;
    }
    setFileError(null);
    setFile(chosen);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!canUpload || !businessId || !branch || !file) return;
    setIsUploading(true);
    setError(null);
    setResult(null);
    try {
      const dataSource = await ensureBranchDataSource(businessId, branch.id, branch.name);
      const uploaded = await uploadFile(businessId, dataSource.id, file);
      // The import just booked sales — move the figure Home shows with it.
      void refreshSalesSummary();
      setResult(uploaded);
    } catch (err) {
      // The server may still be writing rows when the page stops waiting, so
      // "cannot reach the server" would send somebody to retry an import that is
      // about to finish.
      setError(isTimeout(err) ? t('upload.timedOut') : extractErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className={styles.page} onSubmit={handleUpload} noValidate>
      <PageHeader title={t('upload.title')} subtitle={t('upload.subtitle')} />

      <Enter delay={step(1)} className={styles.template}>
        <InfoCard
          icon={IoDownloadOutline}
          title={t('upload.templateTitle')}
          subtitle={t('upload.templateSubtitle')}
          onClick={() =>
            saveBlob(new Blob([SALES_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }), SALES_TEMPLATE_FILENAME)
          }
        />
        <TemplateGuide />
      </Enter>

      {!isLoading && branches.length === 0 ? (
        <Enter delay={step(2)}>
          <InfoCard
            icon={IoStorefrontOutline}
            title={t('upload.noBranchesTitle')}
            subtitle={t('upload.noBranchesSubtitle')}
            to={canOpenRoute(membership, 'addBranch') ? pathTo('addBranch') : undefined}
          />
        </Enter>
      ) : null}

      {branches.length > 0 ? (
        <>
          <Enter delay={step(2)}>
            <Card>
              <BranchPicker
                name="upload-branch"
                legend={t('upload.branchSection')}
                branches={branches}
                value={branchId}
                onChange={setChosenBranchId}
                caption={(b) => [b.code, b.city].filter(Boolean).join(' · ')}
              />
            </Card>
          </Enter>

          <Enter delay={step(3)}>
            <Card title={t('upload.fileSection')}>
              <FileDrop
                accept={ACCEPT}
                file={file}
                onFile={chooseFile}
                title={t('web.upload.pick')}
                hint={t('upload.pickHint')}
                changeHint={t('web.upload.pickChange')}
                disabled={isUploading}
              />
              {fileError ? (
                <p className={styles.fileError} role="alert">
                  {fileError}
                </p>
              ) : null}
              <div className={styles.columns}>
                <p className={styles.columnsLabel}>{t('upload.columnsLabel')}</p>
                <p className={styles.columnsMono}>occurred_at, product_name, quantity, unit_price, payment_method</p>
                <p className={styles.columnsHint}>{t('upload.columnsOptional')}</p>
              </div>
            </Card>
          </Enter>

          {error ? <ErrorBanner key={error} message={error} /> : null}

          {/* Always present, so a screen reader hears the result when it lands in it. */}
          <div aria-live="polite" className={styles.live}>
            {result && summary ? (
              <Enter as="section" className={styles.result}>
                <div className={styles.resultHead}>
                  {summary.clean ? (
                    <IoCheckmarkCircle size={22} className={styles.good} aria-hidden="true" />
                  ) : (
                    <IoWarning size={22} className={styles.warn} aria-hidden="true" />
                  )}
                  <h2 className={styles.resultTitle}>
                    {summary.onlyExamples
                      ? t('upload.onlyExamplesTitle')
                      : summary.clean
                        ? t('upload.doneTitle')
                        : t('upload.partialTitle')}
                  </h2>
                </div>
  
                {summary.onlyExamples ? (
                  <p className={styles.resultBody}>{t('upload.onlyExamplesBody')}</p>
                ) : (
                  <div className={styles.stats}>
                    <StatTile label={t('upload.created')} value={result.transactionsCreated} />
                    <StatTile label={t('upload.updated')} value={result.transactionsUpdated} />
                    <StatTile
                      label={t('upload.failed')}
                      value={result.recordsFailed}
                      accent={result.recordsFailed > 0 ? 'var(--color-error)' : undefined}
                    />
                  </div>
                )}
  
                {summary.notes.length > 0 ? (
                  <ul className={styles.notes}>
                    {summary.notes.map((note) => (
                      <li key={note}>
                        <IoInformationCircleOutline size={16} aria-hidden="true" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
  
                {summary.rowErrors.length > 0 ? (
                  <div className={styles.rowErrors}>
                    <p className={styles.rowErrorsLabel}>{t('upload.rowErrors')}</p>
                    <ul>
                      {summary.rowErrors.slice(0, ROW_ERRORS_SHOWN).map((message, index) => (
                        <li key={`${index}-${message}`}>{message}</li>
                      ))}
                    </ul>
                    {summary.rowErrors.length > ROW_ERRORS_SHOWN ? (
                      <p className={styles.more}>
                        {t('common.more', { count: summary.rowErrors.length - ROW_ERRORS_SHOWN })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </Enter>
            ) : null}
          </div>

          <div className={styles.submit}>
            <PrimaryButton
              type="submit"
              block
              title={isUploading ? t('upload.uploading') : t('upload.submit')}
              icon={IoArrowUp}
              loading={isUploading}
              disabled={!canUpload}
            />
          </div>
        </>
      ) : null}
    </form>
  );
}
