import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient } from '@/api/client';
import type { SalarySlip } from '@/types/staffing';

export async function generateSalarySlip(
  businessId: string,
  staffMemberId: string,
  payload: { month: number; year: number; deductions?: number }
): Promise<SalarySlip> {
  const { data } = await apiClient.post<SalarySlip>(
    `/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`,
    payload
  );
  return data;
}

export async function listStaffSalarySlips(businessId: string, staffMemberId: string): Promise<SalarySlip[]> {
  const { data } = await apiClient.get<SalarySlip[]>(
    `/businesses/${businessId}/staff/${staffMemberId}/salary-slips`
  );
  return data;
}

/**
 * Same "download means different things per platform" split as
 * saveTemplate.ts: the browser saves straight to disk, a phone hands the
 * PDF to the share sheet. Native uses FileSystem.downloadAsync (a plain
 * authenticated HTTP GET straight to a file) rather than manually
 * base64-encoding a fetched buffer — Hermes has no dependable btoa.
 */
export async function downloadSalarySlipPdf(businessId: string, slip: SalarySlip): Promise<void> {
  const path = `/businesses/${businessId}/salary-slips/${slip.id}/pdf`;
  const filename = `salary-slip-${slip.monthYear}.pdf`;

  if (Platform.OS === 'web') {
    const { data } = await apiClient.get<Blob>(path, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    return;
  }

  const fullUrl = `${apiClient.defaults.baseURL}${path}`;
  const authHeader = apiClient.defaults.headers.common.Authorization as string | undefined;
  const uri = `${FileSystem.cacheDirectory}${filename}`;

  const result = await FileSystem.downloadAsync(fullUrl, uri, {
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: filename });
}
