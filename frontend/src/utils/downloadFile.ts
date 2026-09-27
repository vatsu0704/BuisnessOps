import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import i18n from '@/i18n';
import { apiClient } from '@/api/client';

/**
 * Fetches a binary file from the API and hands it to the share sheet.
 *
 * ## Why this does not use `FileSystem.downloadAsync`
 *
 * **It must never use it.** `downloadAsync` does not reject on an HTTP error
 * status, so a 403 writes `{"message":"Insufficient permissions"}` into the file
 * and shares a corrupt one under a `.xlsx` name. That was a real bug in this
 * project once already — see the note in `printDocument.ts`, which was written
 * after it. Going through `apiClient` means axios rejects on a non-2xx and the
 * caller's existing catch reports it properly.
 *
 * ## Why a blob and a FileReader rather than a Buffer
 *
 * `expo-file-system` writes text, so binary has to arrive base64-encoded. Node's
 * `Buffer` is not in an Expo bundle, and adding a polyfill for one conversion
 * would be a dependency for something the platform already does: `FileReader`
 * and `Blob` are both core and `readAsDataURL` produces exactly the base64 this
 * needs. The only work is stripping the `data:…;base64,` prefix.
 */

/** Turns the fetched blob into the base64 string `writeAsStringAsync` wants. */
function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(i18n.t('errors.downloadFailed')));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      // `data:<mime>;base64,<payload>` — everything after the comma is the payload.
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * On the web there is no share sheet, so the file is offered as a download the
 * way a browser expects — an anchor with a blob URL. Kept in the same function
 * as the native path so callers do not each have to know the difference, which
 * is the split `printDocument.ts` already makes.
 */
function downloadInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoked on a timeout rather than immediately: Safari has been observed to
  // cancel the download if the URL is released in the same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function shareApiFile(
  path: string,
  params: Record<string, string | undefined>,
  filename: string,
  mimeType: string
): Promise<void> {
  const { data } = await apiClient.get<Blob>(path, { params, responseType: 'blob' });

  if (Platform.OS === 'web') {
    downloadInBrowser(data, filename);
    return;
  }

  const target = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(target, await base64Of(data), {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(i18n.t('errors.sharingUnavailable'));
  }

  await Sharing.shareAsync(target, { mimeType, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: filename });
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
