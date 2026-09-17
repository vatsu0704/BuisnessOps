import { Platform } from 'react-native';
import { apiClient } from '@/api/client';

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
  recordsProcessed: number;
  recordsValid: number;
  recordsFailed: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  errors: string[];
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
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}
