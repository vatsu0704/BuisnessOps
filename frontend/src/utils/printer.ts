import { PermissionsAndroid, Platform } from 'react-native';
import { ReceiptPrinterModule, type BondedPrinter } from '../../modules/receipt-printer';

/**
 * Talking to the Bluetooth receipt printer — the app's side of
 * `modules/receipt-printer`.
 *
 * Everything that can go wrong comes back as a `PrinterError` whose `code` has a
 * sentence under `printer.errors.*`, because each failure asks the cashier to do
 * something different: turn Bluetooth on, allow the permission, switch the
 * printer on, pair it.
 *
 * Printing never decides whether a sale happened. The counter saves the bill
 * first and prints second; a print that fails leaves a saved bill and a
 * "Print again" button.
 */
export type PrinterErrorCode =
  | 'UNSUPPORTED'
  | 'NO_BLUETOOTH'
  | 'BLUETOOTH_OFF'
  | 'PERMISSION_DENIED'
  | 'PRINTER_UNREACHABLE'
  | 'NOT_CONNECTED'
  | 'WRITE_FAILED'
  | 'NO_PRINTER';

const KNOWN_CODES = new Set<PrinterErrorCode>([
  'UNSUPPORTED',
  'NO_BLUETOOTH',
  'BLUETOOTH_OFF',
  'PERMISSION_DENIED',
  'PRINTER_UNREACHABLE',
  'NOT_CONNECTED',
  'WRITE_FAILED',
  'NO_PRINTER',
]);

export class PrinterError extends Error {
  constructor(readonly code: PrinterErrorCode) {
    super(code);
    this.name = 'PrinterError';
  }
}

export type { BondedPrinter };

/**
 * How long one way of opening the socket may take. The module tries three, so a
 * printer that is switched off is reported in well under a quarter of a minute.
 */
const CONNECT_TIMEOUT_MS = 4000;

/**
 * Close the link after this long without printing. Holding it open makes the
 * next token print at once; holding it all day keeps a battery printer awake.
 */
const IDLE_DISCONNECT_MS = 2 * 60 * 1000;

/**
 * Whether this build can print at all. False on the web, on iOS, and on an
 * Android build from before the printer module existed — which still bills.
 */
export function isPrintingSupported(): boolean {
  return Platform.OS === 'android' && ReceiptPrinterModule != null;
}

function nativeModule() {
  if (!isPrintingSupported() || !ReceiptPrinterModule) throw new PrinterError('UNSUPPORTED');
  return ReceiptPrinterModule;
}

function toPrinterError(err: unknown): PrinterError {
  if (err instanceof PrinterError) return err;
  const code = (err as { code?: string } | null)?.code;
  return new PrinterError(code && KNOWN_CODES.has(code as PrinterErrorCode) ? (code as PrinterErrorCode) : 'PRINTER_UNREACHABLE');
}

/**
 * Asks for Android 12's "Nearby devices" permission, which is what reading the
 * paired printers and connecting to one needs. Older Android grants it at
 * install. Resolves false rather than throwing, so the screen can explain.
 */
export async function ensurePrinterPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 31) return true;
  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** The printers paired with this phone in Android's Bluetooth settings. */
export async function listPairedPrinters(): Promise<BondedPrinter[]> {
  const native = nativeModule();
  if (!(await ensurePrinterPermission())) throw new PrinterError('PERMISSION_DENIED');
  try {
    const devices = await native.getBondedDevices();
    return [...devices].sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    throw toPrinterError(err);
  }
}

let queue: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleDisconnect() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    queue = queue.catch(() => undefined).then(() => ReceiptPrinterModule?.disconnect().catch(() => undefined));
  }, IDLE_DISCONNECT_MS);
}

/**
 * Sends one job. Jobs are queued, so a token tapped while the last one is still
 * printing waits for it instead of interleaving bytes on the same socket.
 *
 * A printer that was switched off between two tokens still looks connected until
 * a write fails, so a failed write reconnects once and tries again before
 * reporting anything.
 */
export function printBytes(address: string | null | undefined, bytes: Uint8Array): Promise<void> {
  const job = async () => {
    if (!address) throw new PrinterError('NO_PRINTER');
    const native = nativeModule();
    if (!(await ensurePrinterPermission())) throw new PrinterError('PERMISSION_DENIED');
    const payload = Array.from(bytes);
    try {
      await native.connect(address, CONNECT_TIMEOUT_MS);
      await native.write(payload);
    } catch (first) {
      const error = toPrinterError(first);
      if (error.code !== 'WRITE_FAILED' && error.code !== 'NOT_CONNECTED') throw error;
      try {
        await native.connect(address, CONNECT_TIMEOUT_MS);
        await native.write(payload);
      } catch (second) {
        throw toPrinterError(second);
      }
    } finally {
      scheduleIdleDisconnect();
    }
  };
  const run = queue.catch(() => undefined).then(job);
  queue = run;
  return run;
}

/** The translation key for a failure, for `t()`. */
export function printerErrorKey(err: unknown): `printer.errors.${PrinterErrorCode}` {
  return `printer.errors.${toPrinterError(err).code}`;
}
