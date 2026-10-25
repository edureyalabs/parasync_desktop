// src/shared/vault.ts
// Types and limits for the secrets this PC keeps for the signed-in person (see docs/LOCAL_SECRETS.md). The page only ever sees names and
// dates (VaultMeta); a value goes in through `put` and is never returned to the page.

export type SecretKind = 'secret' | 'user_secret' | 'browser_access';
export const SECRET_KINDS: readonly SecretKind[] = ['secret', 'user_secret', 'browser_access'];

export const VAULT_LIMITS = {
  maxEntriesPerAccount: 500,
  maxValueChars: 64 * 1024,
  maxHosts: 20,
  idleExpiryMs: 30 * 24 * 60 * 60 * 1000,
  /** A use only rewrites the file when the last recorded use is older than this (jobs can be frequent). */
  touchEveryMs: 60 * 60 * 1000,
} as const;

export interface Ref {
  agentId: string;
  /** secret = an agent secret the admin set; user_secret = a key a connected person supplies; browser_access = a saved website login (name is the login's id). */
  kind: SecretKind;
  name: string;
}

export interface PutInput extends Ref {
  value: string;
  /** The version the cloud gave this secret when it was saved there (0 when it exists on this PC only). */
  version: number;
  deviceOnly: boolean;
  /** Hosts a model-written script may send this secret to (only used for secrets handed to scripts through the local broker). */
  hosts?: string[];
  context?: string;
}

export interface VaultMeta extends Ref {
  version: number;
  deviceOnly: boolean;
  hosts: string[];
  context: string | null;
  savedAt: string;
  lastUsedAt: string;
  /** When it will be deleted if nothing saves or uses it again. */
  expiresAt: string;
}

/** {agent id: {kind: {name: version}}}: what this PC holds, by name only. This is what the cloud is told. */
export type HeldMap = Record<string, Partial<Record<SecretKind, Record<string, number>>>>;

/** Environment names a secret may never take: they would change how the program starts or override the platform's own settings. */
export function isUnsafeEnvName(name: string): boolean {
  return /^(LD_|PYTHON|PARASYNC_|WSL|BASH_|SHELL|PATH$|HOME$|USER$|IFS$|ENV$|TMPDIR$)/.test(name);
}

/** The answer to "does the copy on this PC match the cloud's?". Never contains a value. */
export type VerifyResult =
  | { state: 'match'; cloudVersion: number | null }
  | { state: 'differs'; cloudVersion: number | null }
  | { state: 'pc-only' }          // the value exists on this PC only: there is nothing to compare
  | { state: 'cloud-has-none' }   // the cloud has no such secret (it was deleted there)
  | { state: 'missing' }          // this PC does not hold it (anymore)
  | { state: 'error'; message: string };
