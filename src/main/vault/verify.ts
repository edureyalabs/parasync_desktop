// src/main/vault/verify.ts
// "Does the copy on this PC match the cloud's?" without telling the cloud the value. This PC picks a random salt and sends
// HMAC-SHA256(salt, value); the cloud computes the same over its copy and answers yes or no (bemain/secret_verify.py). A saved website
// login is a set of fields, so both sides first turn it into the same canonical text: sorted keys, no spaces.
import { createHmac, randomBytes } from 'node:crypto';

import type { VerifyResult } from '../../shared/vault';
import type { Ref } from './vault';

/** Sorted keys, no spaces, non-ASCII left as it is: byte for byte what bemain's `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)` makes. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sort(x)]));
    return v;
  };
  return JSON.stringify(sort(value));
}

/** The text that is compared: the value itself, or for a saved login the canonical form of its fields. */
export function comparableText(kind: Ref['kind'], stored: string): string {
  if (kind !== 'browser_access') return stored;
  try {
    return canonicalJson(JSON.parse(stored));
  } catch {
    return stored;
  }
}

export const proofOf = (salt: string, text: string): string => createHmac('sha256', salt).update(text, 'utf8').digest('hex');
export const newSalt = (): string => randomBytes(24).toString('base64url');

/** Turns the cloud's answer into a result for the screen. */
export function readAnswer(status: number, data: unknown): VerifyResult {
  const d = (data ?? {}) as { ok?: boolean; exists?: boolean; match?: boolean; version?: unknown; error?: unknown; detail?: unknown };
  if (status === 429) return { state: 'error', message: 'Too many checks just now. Try again in a minute.' };
  if (status < 200 || status >= 300 || d.ok !== true) {
    return { state: 'error', message: typeof d.error === 'string' ? d.error : typeof d.detail === 'string' ? d.detail : 'The cloud could not check this.' };
  }
  if (d.exists === false) return { state: 'cloud-has-none' };
  const cloudVersion = typeof d.version === 'number' ? d.version : null;
  return d.match === true ? { state: 'match', cloudVersion } : { state: 'differs', cloudVersion };
}
