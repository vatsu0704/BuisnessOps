import { Platform } from 'react-native';
import { apiClient } from '@/api/client';
import type { ApiErrorDetail } from '@/api/errorMessages';

export interface DataSource {
  id: string;
  businessId: string;
  branchId: string | null;
  provider: string;
  displayName: string;
  syncFrequency: string;
  lastSyncedAt: string | null;
}

/** What the ingestion pipeline reports back for one uploaded file. */
export interface UploadResult {
  /** Rows read, not counting the template's EXAMPLE rows. */
  recordsProcessed: number;
  recordsValid: number;
  recordsFailed: number;
  /** Rows whose transaction_external_id starts with EXAMPLE, which are never imported. */
  examplesSkipped?: number;
  /**
   * How a date like 01/09/2026 was read, for the whole file; null when the file
   * had none. Optional because a server older than this app does not send it.
   */
  dateOrder?: 'DAY_FIRST' | 'MONTH_FIRST' | null;
  transactionsCreated: number;
  transactionsUpdated: number;
  /** English, rendered by the server. The fallback when a code has no translation. */
  errors: string[];
  /** The same rejections as codes, so they can be shown in the reader's language. */
  errorDetails?: ApiErrorDetail[];
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
  /** Web only — DocumentPicker hands back a real File we can post directly. */
  file?: File;
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
 * The backend ties every upload to the data source's own branch, so each branch
 * needs its own CSV_UPLOAD source. Reuse the branch's existing one if present.
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

// An import answers only once every row is written, and a month of a busy
// shop's sales against a hosted database takes far longer than the 15s every
// other request is allowed. Five minutes is also Node's default request
// timeout, so the app never gives up on an import the server is still running.
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export async function uploadFile(
  businessId: string,
  dataSourceId: string,
  picked: PickedFile
): Promise<UploadResult> {
  const form = new FormData();

  if (Platform.OS === 'web' && picked.file) {
    form.append('file', picked.file);
  } else {
    // React Native's FormData takes this {uri,name,type} shape rather than a Blob.
    form.append('file', {
      uri: picked.uri,
      name: picked.name,
      type: picked.mimeType ?? 'text/csv',
    } as unknown as Blob);
  }

  const { data } = await apiClient.post<UploadResult>(
    `/businesses/${businessId}/data-sources/${dataSourceId}/upload`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS }
  );
  return data;
}
