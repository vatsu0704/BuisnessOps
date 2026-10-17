import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@shared/i18n/locales/en.json';

/**
 * The web's receipt printer (requirement 31) over a pretend Web Serial: the
 * chosen port is the only one kept, a token goes out in the printer's chunk size,
 * and every failure says which sentence to show.
 */

class FakePort extends EventTarget {
  chunks: number[] = [];
  failOpen = false;
  writable: WritableStream<Uint8Array> | null = null;
  forget = vi.fn(async () => undefined);
  async open() {
    if (this.failOpen) throw new DOMException('Failed to open serial port.', 'NetworkError');
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.chunks.push(chunk.length);
      },
    });
  }
  async close() {
    this.writable = null;
  }
  getInfo() {
    return {};
  }
}

const granted: FakePort[] = [];
const requestPort = vi.fn<() => Promise<FakePort>>();
const fakeSerial = Object.assign(new EventTarget(), {
  getPorts: async () => [...granted],
  requestPort: () => requestPort(),
});

let printer: typeof import('./printer');

beforeAll(async () => {
  Object.defineProperty(navigator, 'serial', { configurable: true, value: fakeSerial });
  printer = await import('./printer');
});

describe('printer (web)', () => {
  beforeEach(async () => {
    await printer.disconnectPrinter();
    granted.length = 0;
    requestPort.mockReset();
  });

  it('says whether this browser can print over Bluetooth', () => {
    expect(printer.serialSupport()).toBe('supported');
    Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined });
    expect(printer.serialSupport()).not.toBe('supported');
    Object.defineProperty(navigator, 'serial', { configurable: true, value: fakeSerial });
  });

  it('keeps only the printer chosen, and treats closing the chooser as a change of mind', async () => {
    const old = new FakePort();
    const chosen = new FakePort();
    granted.push(old, chosen);
    requestPort.mockResolvedValueOnce(chosen);
    expect(await printer.choosePrinter()).toBe(true);
    expect(old.forget).toHaveBeenCalled();
    expect(chosen.forget).not.toHaveBeenCalled();

    requestPort.mockRejectedValueOnce(new DOMException('No port selected by the user.', 'NotFoundError'));
    expect(await printer.choosePrinter()).toBe(false);
  });

  it('asks for a printer to be chosen when none is', async () => {
    const failure = await printer.printBytes(new Uint8Array([1, 2, 3])).catch((err) => err);
    expect(printer.printerErrorKey(failure)).toBe('printer.errors.NO_PRINTER');
  });

  it('sends a token in 512-byte pieces, one job after another', async () => {
    const port = new FakePort();
    granted.push(port);
    await Promise.all([printer.printBytes(new Uint8Array(1200)), printer.printBytes(new Uint8Array(10))]);
    expect(port.chunks).toEqual([512, 512, 176, 10]);
  });

  it('says the printer could not be reached when it will not open', async () => {
    const port = new FakePort();
    port.failOpen = true;
    granted.push(port);
    const failure = await printer.printBytes(new Uint8Array(4)).catch((err) => err);
    expect(printer.printerErrorKey(failure)).toBe('printer.errors.PRINTER_UNREACHABLE');
  });

  it('has a sentence in the source language for every failure it can name', () => {
    const sentences = (en as { printer: { errors: Record<string, string> } }).printer.errors;
    for (const code of ['UNSUPPORTED', 'PRINTER_UNREACHABLE', 'NOT_CONNECTED', 'WRITE_FAILED', 'NO_PRINTER'] as const) {
      expect(sentences[code], code).toBeTruthy();
    }
    expect(printer.printerErrorKey(new Error('anything'))).toBe('printer.errors.PRINTER_UNREACHABLE');
  });
});
