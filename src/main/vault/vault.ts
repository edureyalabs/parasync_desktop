// src/main/vault/vault.ts
// The secrets this PC holds for the signed-in person: API keys and logins they chose to keep on this machine, so that tool runs on this PC
// can use them without the cloud ever sending a secret down.
//
// Rules (each one prevents a real failure; see docs/LOCAL_SECRETS.md):
//  * Values are encrypted with the operating system's per-user protection (Windows DPAPI, through Electron's safeStorage) before they touch the
//    disk. If that protection is not available nothing is stored at all: never in the clear, never "just in memory".
//  * One encrypted blob PER ACCOUNT. Working as account B never decrypts account A's blob, so a bug elsewhere cannot hand A's secrets to B.
//  * The page (renderer) can add, remove and list NAMES. It can never read a value back: there is no function that returns one to the page.
//    Only the executor, in this process, resolves values, and only for the job it is running.
//  * An entry nobody saved or used for 30 days is deleted (sweep), and signing out or switching account does NOT delete anything.
// This file imports nothing from Electron: the encryption and the disk are passed in, so it is tested on its own.

import { SECRET_KINDS, VAULT_LIMITS, isUnsafeEnvName, type HeldMap, type PutInput, type Ref, type SecretKind, type VaultMeta } from '../../shared/vault';

export { SECRET_KINDS, VAULT_LIMITS };
export type { HeldMap, PutInput, Ref, SecretKind, VaultMeta };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,99}$/;
const RESERVED_NAMES = new Set(['PATH', 'HOME', 'LANG', 'PYTHONPATH', 'PYTHONUNBUFFERED', 'PYTHONDONTWRITEBYTECODE']);
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

interface Entry extends VaultMeta {
  value: string;
}

export interface VaultDeps {
  /** Operating-system protection. `available()` false means the vault refuses to store anything. */
  crypto: { available(): boolean; encrypt(plain: string): string; decrypt(encoded: string): string };
  /** The whole file as text (null when there is none yet), and an atomic replacement of it. */
  io: { read(): Promise<string | null>; write(text: string): Promise<void> };
  now(): Date;
}

interface Disk {
  v: 1;
  accounts: Record<string, string>; // userId -> encrypted JSON of {entries}
}

export const keyOf = (r: Ref): string => `${r.agentId}|${r.kind}|${r.name}`;

export function validateRef(r: unknown): Ref {
  const ref = r as Partial<Ref> | null;
  if (!ref || typeof ref !== 'object') throw new Error('invalid secret reference');
  if (typeof ref.agentId !== 'string' || !UUID.test(ref.agentId)) throw new Error('invalid agent');
  if (typeof ref.kind !== 'string' || !SECRET_KINDS.includes(ref.kind as SecretKind)) throw new Error('invalid kind');
  if (typeof ref.name !== 'string') throw new Error('invalid name');
  if (ref.kind === 'browser_access') {
    if (!UUID.test(ref.name)) throw new Error('invalid login id');
  } else if (!SECRET_NAME.test(ref.name) || RESERVED_NAMES.has(ref.name) || isUnsafeEnvName(ref.name)) {
    throw new Error('A secret name must be UPPER_SNAKE_CASE (letters, digits, underscore) and not a reserved name.');
  }
  return { agentId: ref.agentId.toLowerCase(), kind: ref.kind as SecretKind, name: ref.kind === 'browser_access' ? ref.name.toLowerCase() : ref.name };
}

export function cleanHosts(hosts: unknown): string[] {
  if (hosts === undefined || hosts === null) return [];
  if (!Array.isArray(hosts) || hosts.length > VAULT_LIMITS.maxHosts) throw new Error('invalid hosts');
  const out: string[] = [];
  for (const h of hosts) {
    const host = typeof h === 'string' ? h.trim().toLowerCase() : '';
    if (!HOST.test(host)) throw new Error(`"${String(h).slice(0, 60)}" is not a valid host name`);
    if (!out.includes(host)) out.push(host);
  }
  return out;
}

export class Vault {
  private disk: Disk | null = null;
  private readonly cache = new Map<string, Record<string, Entry>>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly d: VaultDeps) {}

  /** Can this PC protect secrets at all? (When not, `put` is refused.) */
  available(): boolean { return this.d.crypto.available(); }

  // ── writes ────────────────────────────────────────────────────────────────

  put(userId: string, input: PutInput): Promise<VaultMeta> {
    return this.exclusive(async () => {
      this.requireUser(userId);
      if (!this.d.crypto.available()) throw new Error('Secure storage is not available on this PC, so secrets cannot be kept here.');
      const ref = validateRef(input);
      if (typeof input.value !== 'string' || input.value.length === 0) throw new Error('A value is required.');
      if (input.value.length > VAULT_LIMITS.maxValueChars) throw new Error('That value is too large.');
      if (!Number.isInteger(input.version) || input.version < 0 || input.version > 1_000_000_000) throw new Error('invalid version');
      const hosts = cleanHosts(input.hosts);
      const entries = await this.loadOrEmpty(userId);
      const key = keyOf(ref);
      if (!(key in entries) && Object.keys(entries).length >= VAULT_LIMITS.maxEntriesPerAccount) throw new Error('This PC already holds the most secrets it can for this account.');
      const now = this.d.now();
      const entry: Entry = {
        ...ref, value: input.value, version: input.version, deviceOnly: input.deviceOnly === true, hosts,
        context: typeof input.context === 'string' && input.context.trim() ? input.context.trim().slice(0, 500) : null,
        savedAt: now.toISOString(), lastUsedAt: now.toISOString(), expiresAt: new Date(now.getTime() + VAULT_LIMITS.idleExpiryMs).toISOString(),
      };
      entries[key] = entry;
      await this.save(userId, entries);
      return this.meta(entry);
    });
  }

  remove(userId: string, ref: unknown): Promise<boolean> {
    return this.exclusive(async () => {
      this.requireUser(userId);
      const key = keyOf(validateRef(ref));
      const entries = await this.loadOrEmpty(userId);
      if (!(key in entries)) return false;
      delete entries[key];
      await this.save(userId, entries);
      return true;
    });
  }

  /** Deletes everything this PC holds for one account (the person asked for it). */
  wipeAccount(userId: string): Promise<void> {
    return this.exclusive(async () => {
      this.requireUser(userId);
      const disk = await this.readDisk();
      delete disk.accounts[userId];
      this.cache.delete(userId);
      await this.d.io.write(JSON.stringify(disk));
    });
  }

  /**
   * Deletes every entry, in every account on this PC, that nobody saved or used for 30 days. Runs at start-up and every few hours.
   * Returns how many were removed. An account whose blob cannot be read (another Windows user wrote it) is left alone.
   */
  sweep(): Promise<number> {
    return this.exclusive(async () => {
      if (!this.d.crypto.available()) return 0;
      const disk = await this.readDisk();
      let removed = 0;
      for (const userId of Object.keys(disk.accounts)) {
        let entries: Record<string, Entry>;
        try { entries = await this.load(userId); } catch { continue; }
        const keep: Record<string, Entry> = {};
        for (const [k, e] of Object.entries(entries)) {
          if (this.expired(e)) removed += 1; else keep[k] = e;
        }
        if (Object.keys(keep).length !== Object.keys(entries).length) {
          if (Object.keys(keep).length === 0) { delete disk.accounts[userId]; this.cache.delete(userId); } else { this.cache.set(userId, keep); disk.accounts[userId] = this.d.crypto.encrypt(JSON.stringify({ entries: keep })); }
        }
      }
      if (removed > 0) await this.d.io.write(JSON.stringify(disk));
      return removed;
    });
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  /** Names, versions and dates only. Never a value. */
  list(userId: string): Promise<VaultMeta[]> {
    return this.exclusive(async () => {
      this.requireUser(userId);
      const entries = await this.loadOrEmpty(userId);
      return Object.values(entries).filter((e) => !this.expired(e)).map((e) => this.meta(e)).sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    });
  }

  /** What the cloud is told this PC holds: names and versions, grouped by agent. */
  held(userId: string): Promise<HeldMap> {
    return this.exclusive(async () => {
      const out: HeldMap = {};
      for (const e of Object.values(await this.loadOrEmpty(userId))) {
        if (this.expired(e)) continue;
        const agent = (out[e.agentId] ??= {});
        (agent[e.kind] ??= {})[e.name] = e.version;
      }
      return out;
    });
  }

  /**
   * The values for one job, used by the executor only. Each wanted reference must be held; the cloud's copy and this PC's copy are kept
   * separately by the person, so the version the cloud names is not compared. Whatever cannot be supplied is listed in `missing` and the
   * caller refuses the job BEFORE running anything.
   * Using an entry counts as using it (it keeps the entry from expiring).
   */
  resolve(userId: string, wanted: (Ref & { version?: number })[]): Promise<{ values: Map<string, Entry>; missing: Ref[] }> {
    return this.exclusive(async () => {
      this.requireUser(userId);
      const entries = await this.loadOrEmpty(userId);
      const values = new Map<string, Entry>();
      const missing: Ref[] = [];
      const now = this.d.now();
      let touched = false;
      for (const w of wanted) {
        const ref = validateRef(w);
        const entry = entries[keyOf(ref)];
        if (!entry || this.expired(entry)) { missing.push(ref); continue; }
        values.set(keyOf(ref), entry);
        if (now.getTime() - Date.parse(entry.lastUsedAt) > VAULT_LIMITS.touchEveryMs) {
          entry.lastUsedAt = now.toISOString();
          entry.expiresAt = new Date(now.getTime() + VAULT_LIMITS.idleExpiryMs).toISOString();
          touched = true;
        }
      }
      if (touched) await this.save(userId, entries);
      return { values, missing };
    });
  }

  /**
   * One value, for MAIN-PROCESS code only (the copy check computes a keyed hash of it). It is never reachable from the page: no IPC handler
   * returns what this returns.
   */
  peek(userId: string, ref: unknown): Promise<{ value: string; version: number; deviceOnly: boolean } | null> {
    return this.exclusive(async () => {
      this.requireUser(userId);
      const entry = (await this.loadOrEmpty(userId))[keyOf(validateRef(ref))];
      return entry && !this.expired(entry) ? { value: entry.value, version: entry.version, deviceOnly: entry.deviceOnly } : null;
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private meta(e: Entry): VaultMeta {
    return { agentId: e.agentId, kind: e.kind, name: e.name, version: e.version, deviceOnly: e.deviceOnly, hosts: [...e.hosts], context: e.context, savedAt: e.savedAt, lastUsedAt: e.lastUsedAt, expiresAt: e.expiresAt };
  }

  private expired(e: Entry): boolean {
    return Date.parse(e.expiresAt) <= this.d.now().getTime();
  }

  private requireUser(userId: string): void {
    if (typeof userId !== 'string' || !UUID.test(userId)) throw new Error('not signed in');
  }

  /** One operation at a time, so two quick saves never overwrite each other's file. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readDisk(): Promise<Disk> {
    if (this.disk) return this.disk;
    let disk: Disk = { v: 1, accounts: {} };
    try {
      const text = await this.d.io.read();
      const parsed: unknown = text ? JSON.parse(text) : null;
      if (parsed && typeof parsed === 'object' && (parsed as Disk).v === 1 && (parsed as Disk).accounts && typeof (parsed as Disk).accounts === 'object') disk = parsed as Disk;
    } catch {
      /* an unreadable file counts as empty: the person re-enters their secrets */
    }
    this.disk = disk;
    return disk;
  }

  private async load(userId: string): Promise<Record<string, Entry>> {
    const cached = this.cache.get(userId);
    if (cached) return cached;
    const disk = await this.readDisk();
    const blob = disk.accounts[userId];
    let entries: Record<string, Entry> = {};
    if (blob) {
      const parsed = JSON.parse(this.d.crypto.decrypt(blob)) as { entries?: Record<string, Entry> };
      entries = parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
    }
    this.cache.set(userId, entries);
    return entries;
  }

  /** For reads: a blob this Windows user cannot decrypt (a copied profile, a reinstall) is treated as empty rather than breaking the app. */
  private async loadOrEmpty(userId: string): Promise<Record<string, Entry>> {
    try { return await this.load(userId); } catch { return {}; }
  }

  private async save(userId: string, entries: Record<string, Entry>): Promise<void> {
    const disk = await this.readDisk();
    this.cache.set(userId, entries);
    if (Object.keys(entries).length === 0) delete disk.accounts[userId];
    else disk.accounts[userId] = this.d.crypto.encrypt(JSON.stringify({ entries }));
    await this.d.io.write(JSON.stringify(disk));
  }
}
