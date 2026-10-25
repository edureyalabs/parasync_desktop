// src/main/vault/index.ts
// Connects the vault to the real machine: Windows' own protection (Electron safeStorage) for the encryption, one file in the app's data folder,
// and a clean-up of old entries. The functions at the bottom are the ONLY ways the page can touch secrets, and none of them returns a value.
import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { PutInput, VaultMeta, VerifyResult } from '../../shared/vault';
import { requireSessionUser, sessionToken } from '../session';
import { apiRequest } from '../webApi';
import { comparableText, newSalt, proofOf, readAnswer } from './verify';
import { Vault, validateRef } from './vault';

const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
let vault: Vault | null = null;
let onChanged: () => void = () => undefined;

const file = () => join(app.getPath('userData'), 'local-secrets.json');
let writing: Promise<void> = Promise.resolve();

/** Atomic replacement (temp file, then rename), owner-only, one write at a time. */
function writeFile(text: string): Promise<void> {
  writing = writing.then(async () => {
    const tmp = `${file()}.tmp`;
    await fs.writeFile(tmp, text, { mode: 0o600 });
    await fs.rename(tmp, file());
  });
  return writing;
}

// Only an unpackaged (development/test) run on a machine without a system key store may swap the Windows encryption for a stand-in, so the screens
// can be exercised on a build server. The installed app can never do this: with no real protection it stores nothing at all.
const standIn = !app.isPackaged && process.env['PARASYNC_TEST_PLAINTEXT_VAULT'] === '1';

export function startVault(changed: () => void): Vault {
  onChanged = changed;
  vault = new Vault({
    crypto: standIn
      ? {
        available: () => true,
        encrypt: (plain) => Buffer.from(`test:${plain}`).toString('base64'),
        decrypt: (encoded) => Buffer.from(encoded, 'base64').toString().replace(/^test:/, ''),
      }
      : {
        available: () => safeStorage.isEncryptionAvailable(),
        encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
        decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64')),
      },
    io: {
      read: async () => { try { return await fs.readFile(file(), 'utf8'); } catch { return null; } },
      write: writeFile,
    },
    now: () => new Date(),
  });
  const sweep = () => { void vault?.sweep().then((n) => { if (n > 0) onChanged(); }).catch(() => undefined); };
  sweep();
  setInterval(sweep, SWEEP_EVERY_MS).unref();
  return vault;
}

const need = (): Vault => {
  if (!vault) throw new Error('secrets are not available');
  return vault;
};

// ── what the page may do (it always acts on the signed-in person, never on an id it supplies) ──

export const vaultInfo = async () => ({ available: need().available() });
export const vaultList = (): Promise<VaultMeta[]> => need().list(requireSessionUser());

export async function vaultPut(input: unknown): Promise<VaultMeta> {
  const meta = await need().put(requireSessionUser(), input as PutInput);
  onChanged();
  return meta;
}

export async function vaultRemove(ref: unknown): Promise<boolean> {
  const removed = await need().remove(requireSessionUser(), ref);
  if (removed) onChanged();
  return removed;
}

export async function vaultWipe(): Promise<void> {
  await need().wipeAccount(requireSessionUser());
  onChanged();
}

/**
 * Asks the cloud whether the copy kept here equals its own, sending only a keyed hash. For a secret that exists on this PC only there is nothing
 * to compare. Never returns a value.
 */
export async function vaultVerify(refInput: unknown): Promise<VerifyResult> {
  try {
    const userId = requireSessionUser();
    const ref = validateRef(refInput);
    const entry = await need().peek(userId, ref);
    if (!entry) return { state: 'missing' };
    if (entry.deviceOnly) return { state: 'pc-only' };
    const salt = newSalt();
    const proof = proofOf(salt, comparableText(ref.kind, entry.value));
    const res = await apiRequest({ path: `/api/agents/${ref.agentId}/secrets/verify`, method: 'POST', body: { kind: ref.kind, name: ref.name, salt, proof }, token: sessionToken() });
    return readAnswer(res.status, res.data);
  } catch (e) {
    return { state: 'error', message: e instanceof Error ? e.message : 'The check failed.' };
  }
}
