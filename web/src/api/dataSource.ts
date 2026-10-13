import { apiClient } from './client';
import type { ApiErrorDetail } from './errorMessages';

export interface DataSource {
  id: string;
  businessId: string;
  branchId: string | null;
  provider: string;
  displayName: string;
  syncFrequency: string;
  lastSyncedAt: string | null;
}

/** What the import reports back for one uploaded file — the app's `UploadResult`. */
export interface UploadResult {
  /** Rows read, not counting the template's EXAMPLE rows. */
  recordsProcessed: number;
  recordsValid: number;
  recordsFailed: number;
  /** Rows whose transaction_external_id starts with EXAMPLE, which are never imported. */
  examplesSkipped?: number;
  /** How a date like 01/09/2026 was read, for the whole file; null when it had none. */
  dateOrder?: 'DAY_FIRST' | 'MONTH_FIRST' | null;
  transactionsCreated: number;
  transactionsUpdated: number;
  /** English, from the server — the fallback for a code this build has no wording for. */
  errors: string[];
  /** The same rejections as codes, to be said in the reader's language. */
  errorDetails?: ApiErrorDetail[];
}

export async function listDataSources(businessId: string): Promise<DataSource[]> {
  const { data } = await apiClient.get<DataSource[]>(`/businesses/${businessId}/data-sources`);
  return data;
}

export async function createDataSource(
  businessId: string,
  payload: { branchId: string; displayName: string }
): Promise<DataSource> {
  const { data } = await apiClient.post<DataSource>(`/businesses/${businessId}/data-sources`, {
    provider: 'CSV_UPLOAD',
    syncFrequency: 'MANUAL',
    ...payload,
  });
  return data;
}

/**
 * Every upload belongs to its data source's branch, so each branch needs its own
 * CSV_UPLOAD source. Reuse the branch's existing one when there is one.
 */
export async function ensureBranchDataSource(
  businessId: string,
  branchId: string,
  branchName: string
): Promise<DataSource> {
  const existing = await listDataSources(businessId);
  const match = existing.find((d) => d.branchId === branchId && d.provider === 'CSV_UPLOAD');
  if (match) return match;
  return createDataSource(businessId, { branchId, displayName: `${branchName} — file upload` });
}

// An import answers only once every row is written, and a month of a busy shop's
// sales against a hosted database takes far longer than an ordinary request is
// allowed. Five minutes is Node's own request timeout, so the page never gives up
// on an import the server is still running.
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export async function uploadFile(businessId: string, dataSourceId: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<UploadResult>(
    `/businesses/${businessId}/data-sources/${dataSourceId}/upload`,
    form,
    {
      // Said explicitly because the client's default is JSON, and axios turns a
      // FormData body into JSON under that header. Named multipart, it leaves the
      // body alone and then drops the header so the browser adds the boundary.
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT_MS,
    }
  );
  return data;
}
