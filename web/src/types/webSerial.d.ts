/**
 * The part of the Web Serial API the receipt printer uses (requirement 31) —
 * TypeScript's DOM library does not declare it yet, and these few lines save a
 * dependency. Chrome and Edge reach a paired Bluetooth printer through it, over
 * the printer's Serial Port Profile.
 */
export {};

declare global {
  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
    /** A Bluetooth port's service, as a 16-bit number or a UUID string. */
    bluetoothServiceClassId?: number | string;
  }

  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
    bluetoothServiceClassId?: number | string;
  }

  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
    allowedBluetoothServiceClassIds?: (number | string)[];
  }

  interface SerialOptions {
    baudRate: number;
  }

  interface SerialPort extends EventTarget {
    readonly writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
    /** Give the site's permission for this port back. Chrome 103+. */
    forget?(): Promise<void>;
  }

  interface Serial extends EventTarget {
    getPorts(): Promise<SerialPort[]>;
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  }

  interface Navigator {
    /** Present in Chrome and Edge on a secure page; absent everywhere else. */
    readonly serial?: Serial;
  }
}
