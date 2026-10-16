import { requireOptionalNativeModule } from 'expo';

/**
 * The receipt printer's native half (`android/…/ReceiptPrinterModule.kt`).
 *
 * Optional on purpose: an APK built before this module existed, the web, and
 * iOS all load the app without it, and they must still bill — printing is
 * what is missing there, not the counter. Callers go through
 * `src/utils/printer.ts`, which turns `null` into a sentence.
 */
export type BondedPrinter = {
  name: string;
  address: string;
};

/**
 * Codes the native side throws, as `error.code`. Kept in step with the
 * `PrinterException` calls in the Kotlin file.
 */
export type PrinterErrorCode =
  | 'NO_BLUETOOTH'
  | 'BLUETOOTH_OFF'
  | 'PERMISSION_DENIED'
  | 'PRINTER_UNREACHABLE'
  | 'NOT_CONNECTED'
  | 'WRITE_FAILED';

type ReceiptPrinterNative = {
  getBondedDevices(): Promise<BondedPrinter[]>;
  connect(address: string, timeoutMs: number): Promise<boolean>;
  /** Bytes as plain numbers 0–255 — the shape every bridge converts without surprises. */
  write(bytes: number[]): Promise<boolean>;
  disconnect(): Promise<boolean>;
};

export const ReceiptPrinterModule = requireOptionalNativeModule<ReceiptPrinterNative>('ReceiptPrinter');
