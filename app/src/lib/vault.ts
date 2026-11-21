import { Directory, File, Paths } from 'expo-file-system';
import { openLocal, sealLocal } from './crypto';

// Everything personal (profile, conversations, circle messages) is stored as
// encrypted files in the app's sandbox. The key lives in the Keychain. On top
// of this, iOS Data Protection encrypts the files while the phone is locked.
const dir = new Directory(Paths.document, 'vault');

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

export async function readVault<T>(name: string, fallback: T): Promise<T> {
  ensureDir();
  const f = new File(dir, `${name}.sealed`);
  if (!f.exists) return fallback;
  try {
    return await openLocal<T>(await f.text());
  } catch (e) {
    console.warn('vault read failed', name, e);
    return fallback;
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const latest = new Map<string, unknown>();

async function flush(name: string) {
  ensureDir();
  const value = latest.get(name);
  latest.delete(name);
  const f = new File(dir, `${name}.sealed`);
  const tmp = new File(dir, `${name}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(await sealLocal(value));
  if (f.exists) f.delete();
  tmp.move(f);
}

/** Debounced, encrypted write. */
export function writeVault(name: string, value: unknown, delayMs = 400) {
  latest.set(name, value);
  const t = pending.get(name);
  if (t) clearTimeout(t);
  pending.set(
    name,
    setTimeout(() => {
      pending.delete(name);
      flush(name).catch((e) => console.warn('vault write failed', name, e));
    }, delayMs),
  );
}

export function wipeVault() {
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
  latest.clear();
  if (dir.exists) dir.delete();
}
