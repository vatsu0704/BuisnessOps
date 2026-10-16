import { create } from 'zustand';
import { readJson, writeJson } from '@/utils/textStore';
import type { PaperWidth } from '@/utils/receipt';

/**
 * Which receipt printer this phone prints to, and how.
 *
 * A setting of the **device**, not of the business or the account: the printer
 * is paired with this phone, and the cashier who picks it up tomorrow — or the
 * owner switching to another business on it — prints to the same one. So it is
 * not keyed on a business and has no `loadedFor`, unlike every store that holds
 * server data; there is no tenant whose rows it could flash.
 *
 * Kept in `textStore`, so it survives restarts and works offline.
 */
export type SavedPrinter = { address: string; name: string };

type PrinterSettings = {
  printer: SavedPrinter | null;
  paperWidth: PaperWidth;
  /** Print the token the moment "Payment done" is tapped. */
  autoPrint: boolean;
};

type PrinterStore = PrinterSettings & {
  isLoaded: boolean;
  load: () => Promise<void>;
  setPrinter: (printer: SavedPrinter | null) => Promise<void>;
  setPaperWidth: (paperWidth: PaperWidth) => Promise<void>;
  setAutoPrint: (autoPrint: boolean) => Promise<void>;
};

const KEY = 'printer-settings';

const DEFAULTS: PrinterSettings = { printer: null, paperWidth: 58, autoPrint: true };

let loading: Promise<void> | null = null;

export const usePrinterStore = create<PrinterStore>((set, get) => {
  async function save(patch: Partial<PrinterSettings>) {
    set(patch);
    const { printer, paperWidth, autoPrint } = get();
    await writeJson(KEY, { printer, paperWidth, autoPrint } satisfies PrinterSettings);
  }

  return {
    ...DEFAULTS,
    isLoaded: false,

    load() {
      if (get().isLoaded) return Promise.resolve();
      loading ??= (async () => {
        const saved = await readJson<Partial<PrinterSettings>>(KEY);
        set({
          printer: saved?.printer ?? null,
          paperWidth: saved?.paperWidth === 80 ? 80 : 58,
          autoPrint: saved?.autoPrint ?? DEFAULTS.autoPrint,
          isLoaded: true,
        });
      })().finally(() => {
        loading = null;
      });
      return loading;
    },

    setPrinter: (printer) => save({ printer }),
    setPaperWidth: (paperWidth) => save({ paperWidth }),
    setAutoPrint: (autoPrint) => save({ autoPrint }),
  };
});
