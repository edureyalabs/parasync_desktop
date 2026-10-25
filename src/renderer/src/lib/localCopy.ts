// src/renderer/src/lib/localCopy.ts
// When the person saves a secret from a web-copy screen in this app (Secrets, My Keys, a Browser Access login), the cloud save goes ahead as
// always, and then — unless they turned it off — a copy is also kept in this PC's vault, so tools can run here without the cloud sending
// anything down. This runs only after the cloud accepted the save; a failure here never undoes or hides the cloud save.
// The vault is write-only from the page: the value goes in here and is never read back (see src/shared/vault.ts).
import type { SecretKind } from '@shared/vault';

const SWITCH_KEY = 'vault.keepCopies';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SECRETS = new RegExp(`^/api/agents/(${UUID})/secrets$`, 'i');
const USER_SECRETS = new RegExp(`^/api/agents/(${UUID})/user-secrets$`, 'i');
const LOGIN = new RegExp(`^/api/agents/(${UUID})/browser-access/(${UUID})/credentials$`, 'i');

/** Requests made by this app's own vault screen carry this header: it stores the copy itself, so the bridge must not do it a second time. */
export const NO_AUTO_COPY_HEADER = 'x-parasync-no-vault';

export async function keepingCopies(): Promise<boolean> {
  try {
    return (await window.parasync.storage.get(SWITCH_KEY)) !== '0';
  } catch {
    return true;
  }
}

export async function setKeepingCopies(on: boolean): Promise<void> {
  await window.parasync.storage.set(SWITCH_KEY, on ? '1' : '0');
}

interface Saved { kind: SecretKind; agentId: string; name: string; value: string; version: number }

/** Works out what a successful save was, from the address and what was sent. Pure, so it is tested alone. */
export function savedFrom(path: string, body: unknown, answer: unknown): Saved | null {
  const b = (body ?? {}) as { name?: unknown; value?: unknown; storage?: unknown; values?: unknown };
  const a = (answer ?? {}) as { ok?: unknown; version?: unknown; complete?: unknown };
  if (a.ok !== true || typeof a.version !== 'number' || !Number.isInteger(a.version) || a.version < 0) return null;

  const secrets = SECRETS.exec(path);
  const mine = USER_SECRETS.exec(path);
  if (secrets || mine) {
    if (typeof b.name !== 'string' || typeof b.value !== 'string' || !b.value || b.storage === 'device_only') return null;
    return { kind: secrets ? 'secret' : 'user_secret', agentId: (secrets ?? mine)![1]!.toLowerCase(), name: b.name.trim(), value: b.value, version: a.version };
  }

  const login = LOGIN.exec(path);
  if (login) {
    // Only when this very submission carried every field: a blank field keeps the cloud's old value, which a copy made here would be missing.
    if (a.complete !== true || !b.values || typeof b.values !== 'object') return null;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.values as Record<string, unknown>)) {
      const text = typeof v === 'boolean' ? (v ? 'true' : 'false') : v;
      if (typeof text === 'string' && text.trim() && text.length <= 500) fields[k] = text;
    }
    if (Object.keys(fields).length === 0) return null;
    return { kind: 'browser_access', agentId: login[1]!.toLowerCase(), name: login[2]!.toLowerCase(), value: JSON.stringify(fields), version: a.version };
  }
  return null;
}

export async function keepLocalCopy(path: string, method: string, body: unknown, status: number, answer: unknown, headers: HeadersInit | undefined): Promise<void> {
  if (method !== 'POST' || status < 200 || status >= 300) return;
  if (new Headers(headers).has(NO_AUTO_COPY_HEADER)) return;
  const saved = savedFrom(path, body, answer);
  if (!saved || !(await keepingCopies())) return;
  try {
    await window.parasync.vault.put({ agentId: saved.agentId, kind: saved.kind, name: saved.name, value: saved.value, version: saved.version, deviceOnly: false });
  } catch (e) {
    console.warn('[vault] could not keep a copy on this PC:', e instanceof Error ? e.message : e);
  }
}
