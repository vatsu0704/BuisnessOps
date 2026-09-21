import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import i18n from '@/i18n';

/**
 * Turns a server-rendered HTML document into a PDF the user can keep.
 *
 * Same per-platform split as saveTemplate.ts: on a phone the useful action is
 * handing a file to the share sheet; in a browser it is the print dialog.
 *
 * Why HTML rather than a server-generated PDF: the previous payslip was built
 * with pdfmake configured for base-14 Helvetica, which is WinAnsi-only and has
 * no glyph for `₹` or any Indic script — in an app that ships in English,
 * Hindi, Gujarati and Marathi. Rendering in a WebView uses the device's own
 * fonts, so those all work with no embedded font bytes and no server-side
 * headless browser.
 *
 * NOTE for anyone adding another download: do NOT reach for
 * `FileSystem.downloadAsync`. It does not reject on an HTTP error status, so a
 * 403 writes the JSON error body into the file and shares a corrupt PDF. That
 * was a real bug here. Fetch through `apiClient` (axios rejects on non-2xx) and
 * pass the body to this function instead.
 */
export async function printHtmlDocument(html: string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    // A hidden iframe rather than window.open: popups are blocked by default
    // in most browsers, and a blocked popup fails silently.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      throw new Error(i18n.t('errors.printUnavailable'));
    }
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 250));
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Leave it long enough for the print dialog to take its snapshot.
    setTimeout(() => iframe.parentNode && document.body.removeChild(iframe), 60000);
    return;
  }

  // A4 at 72dpi. expo-print defaults to US Letter, which would letterbox a
  // document whose CSS declares @page { size: A4 }.
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

  // printToFileAsync names the file with a uuid, so the share sheet would
  // offer "a6f3….pdf". Move it so the person sees "payslip-2026-09.pdf".
  const target = `${FileSystem.cacheDirectory}${filename}`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: target });
  } catch {
    // If the move fails the PDF itself is still fine — share it under its
    // generated name rather than failing the whole action.
    await shareFile(uri, filename);
    return;
  }

  await shareFile(target, filename);
}

async function shareFile(uri: string, filename: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(i18n.t('errors.sharingUnavailable'));
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: filename,
  });
}
