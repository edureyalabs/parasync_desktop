// src/main/secureStore.ts
// Where the signed-in session (access + refresh tokens) lives on this PC. Values are encrypted with Windows DPAPI
// (Electron safeStorage) before they touch the disk, so another Windows user or a copied profile folder cannot read
// them. If encryption is not available the session is kept in memory only: the person signs in again next launch,
// which is safer than writing tokens in the clear.
import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const MAX_KEY = 256;
const MAX_VALUE = 512 * 1024;

type Disk = Record<string, string>; // key -> base64 of the encrypted value

const file = () => join(app.getPath('userData'), 'secure-store.json');
const memory = new Map<string, string>();
let cache: Disk | null = null;
let queue: Promise<void> = Promise.resolve();

export const encryptionAvailable = (): boolean => safeStorage.isEncryptionAvailable();

async function load(): Promise<Disk> {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file(), 'utf8'));
    cache = parsed && typeof parsed === 'object' ? (parsed as Disk) : {};
  } catch {
    cache = {}; // missing or unreadable: start empty, the person just signs in again
  }
  return cache;
}

/** Writes are serialized and atomic (temp file, then rename) so a crash never leaves a half-written file. */
function persist(disk: Disk): Promise<void> {
  queue = queue.then(async () => {
    const tmp = `${file()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(disk), { mode: 0o600 });
    await fs.rename(tmp, file());
  }).catch((e) => {
    console.error('[secureStore] could not write', e instanceof Error ? e.message : e);
  });
  return queue;
}

function check(key: unknown): asserts key is string {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY) throw new Error('invalid storage key');
}

export async function getItem(key: unknown): Promise<string | null> {
  check(key);
  if (!encryptionAvailable()) return memory.get(key) ?? null;
  const stored = (await load())[key];
  if (!stored) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return null; // written by another Windows account or a different install: treat as signed out
  }
}

export async function setItem(key: unknown, value: unknown): Promise<void> {
  check(key);
  if (typeof value !== 'string' || value.length > MAX_VALUE) throw new Error('invalid storage value');
  if (!encryptionAvailable()) {
    memory.set(key, value);
    return;
  }
  const disk = await load();
  disk[key] = safeStorage.encryptString(value).toString('base64');
  await persist(disk);
}

export async function removeItem(key: unknown): Promise<void> {
  check(key);
  memory.delete(key);
  const disk = await load();
  if (key in disk) {
    delete disk[key];
    await persist(disk);
  }
}
