// src/main/vault/redact.ts
// The last line of defence for secrets that were handed to a script on this PC: before an answer leaves for the cloud, every place in it
// that holds one of those values verbatim is blanked. The cloud does the same for the secrets it knows, but a secret that exists only on
// this PC is unknown to the cloud, so this PC must do it. (Same rules as the cloud's secret_redaction.py.)

const MIN_LENGTH = 4;
export const PLACEHOLDER = '[REDACTED]';
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

export function needlesOf(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((v) => typeof v === 'string' && v.length >= MIN_LENGTH))].sort((a, b) => b.length - a.length); // longest first
}

function walk(value: unknown, needles: string[], jwt: boolean): unknown {
  if (typeof value === 'string') {
    let text = value;
    for (const n of needles) if (text.includes(n)) text = text.split(n).join(PLACEHOLDER);
    return jwt ? text.replace(JWT, PLACEHOLDER) : text;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, needles, jwt));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, needles, jwt);
    return out;
  }
  return value;
}

/**
 * `value` with every occurrence of any of `secrets` replaced. With `jwt` also blanks anything shaped like a login token (used for a browser
 * session that was logged in with a saved login). Output files travel as base64 and are not text the model reads, so callers leave them out.
 */
export function redactDeep<T>(value: T, secrets: Iterable<string>, jwt = false): T {
  const needles = needlesOf(secrets);
  if (needles.length === 0 && !jwt) return value;
  return walk(value, needles, jwt) as T;
}

/**
 * An answer from the Linux box with the secrets blanked everywhere EXCEPT in `output_files` (base64 file contents the model never reads as
 * text, and which would be corrupted by a text replacement).
 */
export function redactOutcome<T extends Record<string, unknown>>(outcome: T, secrets: Iterable<string>, jwt = false): T {
  const { output_files: files, ...rest } = outcome as Record<string, unknown>;
  const clean = redactDeep(rest, secrets, jwt);
  return (files === undefined ? clean : { ...clean, output_files: files }) as T;
}
