import { create } from 'zustand';
import type { PaperWidth } from '@shared/utils/receipt';
import { storage, STORAGE_KEYS } from '@/utils/storage';

/**
 * How this browser prints tokens (requirement 31) — the app's printer settings,
 * kept in localStorage because they are a setting of this computer, not of a
 * business or an account. No `loadedFor` for the same reason.
 *
 * - `bluetooth`: straight to the paired printer through Web Serial (Chrome, Edge).
 * - `dialog`: the browser's print dialog with a slip the paper's width — any
 *   browser, any printer the system has.
 * - `null`: not set up yet, so a token is shown and not printed.
 */
export type PrintMethod = 'bluetooth' | 'dialog';

type PrinterSettings = {
  method: PrintMethod | null;
  paperWidth: PaperWidth;
  /** Print the token the moment Payment done is pressed. */
  autoPrint: boolean;
};

type PrinterStore = PrinterSettings & {
  setMethod: (method: PrintMethod | null) => void;
  setPaperWidth: (paperWidth: PaperWidth) => void;
  setAutoPrint: (autoPrint: boolean) => void;
};

const DEFAULTS: PrinterSettings = { method: null, paperWidth: 58, autoPrint: true };

function read(): PrinterSettings {
  try {
    const saved = JSON.parse(storage.get(STORAGE_KEYS.printer) ?? 'null') as Partial<PrinterSettings> | null;
    return {
      method: saved?.method === 'bluetooth' || saved?.method === 'dialog' ? saved.method : null,
      paperWidth: saved?.paperWidth === 80 ? 80 : 58,
      autoPrint: saved?.autoPrint ?? DEFAULTS.autoPrint,
    };
  } catch {
    return DEFAULTS;
  }
}

export const usePrinterStore = create<PrinterStore>((set, get) => {
  function save(patch: Partial<PrinterSettings>) {
    set(patch);
    const { method, paperWidth, autoPrint } = get();
    storage.set(STORAGE_KEYS.printer, JSON.stringify({ method, paperWidth, autoPrint } satisfies PrinterSettings));
  }

  return {
    ...read(),
    setMethod: (method) => save({ method }),
    setPaperWidth: (paperWidth) => save({ paperWidth }),
    setAutoPrint: (autoPrint) => save({ autoPrint }),
  };
});

// A change made in another tab is this tab's too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.printer) usePrinterStore.setState(read());
  });
}
