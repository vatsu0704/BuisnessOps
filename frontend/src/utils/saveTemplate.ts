import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SALES_TEMPLATE_CSV, SALES_TEMPLATE_FILENAME } from '@/constants/salesTemplate';

/**
 * "Download" means different things per platform: the browser can save straight to
 * disk, while on a phone the useful action is handing the file to the share sheet
 * (mail it to yourself, drop it in Drive, open it in a spreadsheet app).
 */
export async function saveSalesTemplate(): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([SALES_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = SALES_TEMPLATE_FILENAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const uri = `${FileSystem.cacheDirectory}${SALES_TEMPLATE_FILENAME}`;
  await FileSystem.writeAsStringAsync(uri, SALES_TEMPLATE_CSV, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: SALES_TEMPLATE_FILENAME,
  });
}
