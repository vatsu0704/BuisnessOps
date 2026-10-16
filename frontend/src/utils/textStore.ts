import { Platform } from 'react-native';
// The legacy entry point, as everywhere else in this app (see printDocument.ts).
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Small JSON documents kept on this device, in the app's private storage.
 *
 * What lives here is what must survive the app being killed or the phone losing
 * its connection: the counter's unsynced bills, the cached catalog the counter
 * rings up from offline, the last known session, and the printer settings.
 *
 * Not SecureStore, which is for secrets and documents roughly 2KB per value — a
 * day's bills are far larger. Not AsyncStorage either: that would be a new
 * native dependency for something the file system the app already ships does,
 * and a write here can be awaited to the disk, which is what lets the counter
 * promise a bill is saved before it prints the token.
 *
 * Each write goes to a temporary file first and is then moved over the old one,
 * so a crash mid-write leaves the previous document intact rather than half a
 * JSON file; a read that finds only the temporary file uses it. Writes to the
 * same key are queued, so two saves in quick succession land in order.
 */
const isWeb = Platform.OS === 'web';
const ROOT = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}hisabkitab/` : null;

const queues = new Map<string, Promise<unknown>>();
let rootReady: Promise<void> | null = null;

function fileFor(key: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(key)) throw new Error(`Invalid text store key: ${key}`);
  return `${ROOT}${key}.json`;
}

function ensureRoot(): Promise<void> {
  if (!ROOT) return Promise.resolve();
  if (!rootReady) {
    rootReady = FileSystem.makeDirectoryAsync(ROOT, { intermediates: true }).catch(async (err) => {
      // Already there is the normal case after the first launch.
      const info = await FileSystem.getInfoAsync(ROOT);
      if (!info.exists) {
        rootReady = null;
        throw err;
      }
    });
  }
  return rootReady;
}

/** Runs `job` after every earlier job for the same key has finished. */
function serialize<T>(key: string, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(job);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

async function readFile(uri: string): Promise<string | null> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(uri);
}

export async function readText(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return window.localStorage.getItem(`hisabkitab_${key}`);
    } catch {
      return null;
    }
  }
  if (!ROOT) return null;
  return serialize(key, async () => {
    await ensureRoot();
    const file = fileFor(key);
    return (await readFile(file)) ?? (await readFile(`${file}.tmp`));
  });
}

export async function writeText(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.setItem(`hisabkitab_${key}`, value);
    } catch {
      // Storage disabled or full: the caller's in-memory state is still right.
    }
    return;
  }
  if (!ROOT) return;
  await serialize(key, async () => {
    await ensureRoot();
    const file = fileFor(key);
    const tmp = `${file}.tmp`;
    await FileSystem.writeAsStringAsync(tmp, value);
    await FileSystem.deleteAsync(file, { idempotent: true });
    await FileSystem.moveAsync({ from: tmp, to: file });
  });
}

export async function removeText(key: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.removeItem(`hisabkitab_${key}`);
    } catch {
      // ignore
    }
    return;
  }
  if (!ROOT) return;
  await serialize(key, async () => {
    const file = fileFor(key);
    await FileSystem.deleteAsync(file, { idempotent: true });
    await FileSystem.deleteAsync(`${file}.tmp`, { idempotent: true });
  });
}

/** JSON on top of the text calls; an unreadable document reads as absent. */
export async function readJson<T>(key: string): Promise<T | null> {
  const text = await readText(key);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): Promise<void> {
  return writeText(key, JSON.stringify(value));
}
