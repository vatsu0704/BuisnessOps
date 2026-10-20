/**
 * The web counter's receipt printer (requirement 31) — the app's `utils/printer.ts`
 * over the browser's Web Serial API instead of a native Bluetooth module.
 *
 * Chrome and Edge, on a computer or an Android phone, reach a printer paired in
 * the system's Bluetooth settings through its Serial Port Profile, and are sent
 * exactly the bytes the app sends (`utils/receipt.ts`, shared). The person picks
 * the printer once, in the browser's own chooser; after that this site may open
 * it without asking, which is what lets a token print by itself the moment
 * Payment done is pressed. Web Serial says nothing of a device's name, so the
 * rule is simple: this site holds exactly one port, and it is the printer.
 *
 * Any other browser, or a USB printer installed in the system, prints through
 * the print dialog instead (`utils/receiptHtml.ts`).
 *
 * Jobs run one at a time — and across tabs, under a Web Lock — over one port
 * kept open for two minutes after the last job, so a busy counter does not
 * reconnect for every token.
 */

/** The `printer.errors.*` sentences the web can need; the rest are about a phone. */
export type PrinterErrorCode = 'UNSUPPORTED' | 'PRINTER_UNREACHABLE' | 'NOT_CONNECTED' | 'WRITE_FAILED' | 'NO_PRINTER';

export class PrinterError extends Error {
  constructor(readonly code: PrinterErrorCode) {
    super(code);
    this.name = 'PrinterError';
  }
}

/** Bluetooth's Serial Port Profile — what a Bluetooth receipt printer offers. */
const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
/** Ignored by a Bluetooth port, but required to open one. */
const BAUD_RATE = 9600;
const OPEN_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 10_000;
const CHUNK_BYTES = 512;
const IDLE_CLOSE_MS = 2 * 60 * 1000;
const LOCK_NAME = 'kitnapay-printer';
const CHANNEL = 'kitnapay-printer';

/** Whether this browser can print to a Bluetooth printer, and if not, why. */
export function serialSupport(): 'supported' | 'insecure' | 'unsupported' {
  if (typeof navigator !== 'undefined' && navigator.serial) return 'supported';
  // Chrome hides Web Serial on a page that is not https (or localhost).
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  return 'unsupported';
}

function serial(): Serial {
  if (!navigator.serial) throw new PrinterError('UNSUPPORTED');
  return navigator.serial;
}

/** The translation key for what went wrong, typed against the shared English file. */
export function printerErrorKey(err: unknown): `printer.errors.${PrinterErrorCode}` {
  const code = err instanceof PrinterError ? err.code : 'PRINTER_UNREACHABLE';
  return `printer.errors.${code}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: PrinterErrorCode, onLate?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new PrinterError(code));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        if (settled) onLate?.();
        else resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        if (!settled) reject(err);
      }
    );
  });
}

// --- Choosing the printer -------------------------------------------------------

/**
 * Open the browser's chooser for Bluetooth serial printers and keep the one
 * picked, forgetting any other this site held. Resolves false when the person
 * closed the chooser — that is a change of mind, not an error. Needs a click.
 */
export async function choosePrinter(): Promise<boolean> {
  let chosen: SerialPort;
  try {
    chosen = await serial().requestPort({
      filters: [{ bluetoothServiceClassId: SPP_UUID }],
      allowedBluetoothServiceClassIds: [SPP_UUID],
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return false;
    if (err instanceof PrinterError) throw err;
    throw new PrinterError('UNSUPPORTED');
  }
  await closeOpenPort();
  for (const port of await serial().getPorts()) {
    if (port !== chosen) await port.forget?.().catch(() => undefined);
  }
  return true;
}

/** Whether a printer has been chosen in this browser — asked without a click. */
export async function hasChosenPrinter(): Promise<boolean> {
  if (serialSupport() !== 'supported') return false;
  return (await serial().getPorts()).length > 0;
}

/** Give back this site's permission for every port. */
export async function forgetPrinter(): Promise<void> {
  if (serialSupport() !== 'supported') return;
  await closeOpenPort();
  for (const port of await serial().getPorts()) await port.forget?.().catch(() => undefined);
}

// --- Printing ---------------------------------------------------------------------

let openPort: SerialPort | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function closeOpenPort() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const port = openPort;
  openPort = null;
  if (port) await withTimeout(port.close(), 3000, 'NOT_CONNECTED').catch(() => undefined);
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    queue = queue.catch(() => undefined).then(closeOpenPort);
  }, IDLE_CLOSE_MS);
}

let channel: BroadcastChannel | null | undefined;
function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    // Only one tab can hold the port open: when another asks, an idle one lets go.
    // It cannot be mid-job, because the asker holds the job lock.
    channel?.addEventListener('message', (event: MessageEvent<{ type: string }>) => {
      if (event.data?.type === 'release') void closeOpenPort();
    });
  }
  return channel;
}

if (typeof navigator !== 'undefined' && navigator.serial) {
  navigator.serial.addEventListener('disconnect', (event) => {
    if (event.target === openPort) openPort = null;
  });
  getChannel();
}

async function open(port: SerialPort) {
  if (openPort === port && port.writable) return;
  await closeOpenPort();
  // Opened late, after giving up on it: close it again rather than hold it.
  await withTimeout(port.open({ baudRate: BAUD_RATE }), OPEN_TIMEOUT_MS, 'PRINTER_UNREACHABLE', () => {
    void port.close().catch(() => undefined);
  }).catch((err) => {
    throw err instanceof PrinterError ? err : new PrinterError('PRINTER_UNREACHABLE');
  });
  openPort = port;
}

async function write(port: SerialPort, bytes: Uint8Array) {
  if (!port.writable) throw new PrinterError('NOT_CONNECTED');
  const writer = port.writable.getWriter();
  try {
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      await withTimeout(writer.write(bytes.slice(offset, offset + CHUNK_BYTES)), WRITE_TIMEOUT_MS, 'WRITE_FAILED');
    }
  } catch (err) {
    throw err instanceof PrinterError ? err : new PrinterError(openPort === port ? 'WRITE_FAILED' : 'NOT_CONNECTED');
  } finally {
    try {
      writer.releaseLock();
    } catch {
      // A write still pending keeps the lock; closing the port below frees it.
    }
  }
}

async function printOnce(bytes: Uint8Array) {
  const [port] = await serial().getPorts();
  if (!port) throw new PrinterError('NO_PRINTER');
  try {
    await open(port);
  } catch (err) {
    // Another tab may be holding it open: ask it to let go, and try once more.
    getChannel()?.postMessage({ type: 'release' });
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await open(port);
    } catch {
      throw err;
    }
  }
  await write(port, bytes);
}

async function job(bytes: Uint8Array) {
  if (serialSupport() !== 'supported') throw new PrinterError('UNSUPPORTED');
  try {
    await printOnce(bytes);
  } catch (first) {
    const error = first instanceof PrinterError ? first : new PrinterError('PRINTER_UNREACHABLE');
    if (error.code !== 'WRITE_FAILED' && error.code !== 'NOT_CONNECTED') throw error;
    // A port that went to sleep: open it afresh and send once more.
    await closeOpenPort();
    await printOnce(bytes);
  } finally {
    scheduleIdleClose();
  }
}

/**
 * Send one receipt's bytes to the chosen printer. Jobs queue behind each other,
 * here and across tabs, so two tokens never interleave on the paper.
 */
export function printBytes(bytes: Uint8Array): Promise<void> {
  const locked = async (): Promise<void> => {
    // Awaited: the lock resolves with what its callback returns, a promise.
    if (navigator.locks) await navigator.locks.request(LOCK_NAME, () => job(bytes));
    else await job(bytes);
  };
  const run = queue.catch(() => undefined).then(locked);
  queue = run;
  return run;
}

/** Let the printer go — on sign-out. */
export function disconnectPrinter(): Promise<void> {
  return closeOpenPort();
}
