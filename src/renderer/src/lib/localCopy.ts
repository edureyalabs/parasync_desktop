// src/renderer/src/lib/localCopy.ts
// Secrets and website logins can be kept in the cloud, on this PC, or both. The two copies are kept separately by the person and are never
// compared or moved from one to the other: a value typed once in a save dialog goes to whichever places the person ticked, and that is all.
//
// The web's save dialogs show a "save in the cloud / keep on this PC" choice (shims/localCopy.tsx). The choice is held here, and the API bridge
// (shims/apiBridge.ts) acts on it: it can drop the value from a cloud save (then only the name is recorded in the cloud), and after the cloud
// accepted a save it keeps a copy in this PC's vault. A failure here never undoes or hides the cloud save.
// The vault is write-only from the page: the value goes in here and is never read back (see src/shared/vault.ts).
import type { SecretKind } from '@shared/vault';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SECRETS = new RegExp(`^/api/agents/(${UUID})/secrets$`, 'i');
const USER_SECRETS = new RegExp(`^/api/agents/(${UUID})/user-secrets$`, 'i');
const LOGIN = new RegExp(`^/api/agents/(${UUID})/browser-access/(${UUID})/credentials$`, 'i');

export interface SaveChoice {
  /** Keep the value in the cloud (always true for a website login). When false only the name is recorded there. */
  cloud: boolean;
  /** Also keep a copy in this PC's vault. */
  pc: boolean;
}

let current: SaveChoice | null = null;
/** Set by the save dialog while it is on screen, cleared when it closes. With no dialog the bridge does nothing extra. */
export function setSaveChoice(choice: SaveChoice | null): void {
  current = choice;
}
export function getSaveChoice(): SaveChoice | null {
  return current;
}

/** The vault changed (a copy was added or removed): screens showing it re-read. */
const changes = new EventTarget();
export function announceVaultChanged(): void {
  changes.dispatchEvent(new Event('changed'));
}
export function onVaultChanged(listener: () => void): () => void {
  changes.addEventListener('changed', listener);
  return () => changes.removeEventListener('changed', listener);
}

interface Saved { kind: SecretKind; agentId: string; name: string; value: string; version: number }

/** Works out what a successful save was, from the address and what was sent. Pure, so it is tested alone. */
export function savedFrom(path: string, body: unknown, answer: unknown): Saved | null {
  const b = (body ?? {}) as { name?: unknown; value?: unknown; values?: unknown };
  const a = (answer ?? {}) as { ok?: unknown; version?: unknown; complete?: unknown };
  if (a.ok !== true) return null;
  const version = typeof a.version === 'number' && Number.isInteger(a.version) && a.version >= 0 ? a.version : 0;

  const secrets = SECRETS.exec(path);
  const mine = USER_SECRETS.exec(path);
  if (secrets || mine) {
    if (typeof b.name !== 'string' || typeof b.value !== 'string' || !b.value) return null;
    return { kind: secrets ? 'secret' : 'user_secret', agentId: (secrets ?? mine)![1]!.toLowerCase(), name: b.name.trim(), value: b.value, version };
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
    return { kind: 'browser_access', agentId: login[1]!.toLowerCase(), name: login[2]!.toLowerCase(), value: JSON.stringify(fields), version };
  }
  return null;
}

/** For a secret save the person wants kept off the cloud: the same request without the value, marked name-only. Anything else is unchanged. */
export function withoutCloudValue(path: string, body: unknown, choice: SaveChoice | null): unknown {
  if (!choice || choice.cloud || !choice.pc) return body;
  if (!SECRETS.test(path) && !USER_SECRETS.test(path)) return body;
  const { value: _dropped, ...rest } = (body ?? {}) as Record<string, unknown>;
  void _dropped;
  return { ...rest, storage: 'device_only' };
}

export async function keepLocalCopy(path: string, method: string, sentBody: unknown, status: number, answer: unknown, choice: SaveChoice | null): Promise<void> {
  if (method !== 'POST' || status < 200 || status >= 300 || !choice?.pc) return;
  const saved = savedFrom(path, sentBody, answer);
  if (!saved) return;
  try {
    await window.parasync.vault.put({ agentId: saved.agentId, kind: saved.kind, name: saved.name, value: saved.value, version: saved.version, deviceOnly: !choice.cloud });
    announceVaultChanged();
  } catch (e) {
    console.warn('[vault] could not keep a copy on this PC:', e instanceof Error ? e.message : e);
  }
}
