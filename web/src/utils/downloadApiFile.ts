import { apiClient } from '@/api/client';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Download a file the API builds — an export spreadsheet, a template.
 *
 * Always through `apiClient`, never by pointing a link at the URL: the request
 * needs the bearer token, and axios rejects a 403 so the caller's catch reports
 * it. A plain download would save the refusal's JSON under a `.xlsx` name — which
 * is exactly what shipped in the app once, through `downloadAsync`.
 */
export async function downloadApiFile(
  path: string,
  params: Record<string, string | undefined>,
  filename: string
): Promise<void> {
  const { data } = await apiClient.get<Blob>(path, { params, responseType: 'blob' });
  saveBlob(data, filename);
}

/** Hand a blob to the browser as a download under this name. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked later rather than at once: some browsers start reading the URL only
  // after click() has returned.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
