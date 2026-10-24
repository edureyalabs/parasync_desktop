// src/renderer/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

import { APP_CONFIG } from '@shared/config';

// The signed-in session is stored by the main process, encrypted with Windows DPAPI (see src/main/secureStore.ts),
// not in the page's own storage.
const storage = {
  getItem: (key: string) => window.parasync.storage.get(key),
  setItem: (key: string, value: string) => window.parasync.storage.set(key, value),
  removeItem: (key: string) => window.parasync.storage.remove(key),
};

const READ_TIMEOUT_MS = 12_000;
const WRITE_TIMEOUT_MS = 25_000;

/** Realtime channel names must be unique per subscription: a repeated name hands back an already-subscribed channel. */
export const topic = (base: string) => `${base}:${Math.random().toString(36).slice(2, 8)}`;

/** Plain-language version of a failed request, for screens. */
export function friendlyError(message: string): string {
  if (/failed to fetch|network|timeout|aborted|err_/i.test(message)) {
    return 'Parasync can’t be reached. Check your internet connection, VPN or firewall, then try again.';
  }
  return message;
}

// Offices drop and stall connections. Without a timeout a stalled request leaves a screen spinning forever;
// reads are idempotent so they get one retry.
const resilientFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD';
  const attempts = idempotent ? 2 : 1;
  const timeoutMs = idempotent ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const outer = init?.signal;
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener('abort', onOuterAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (e) {
      lastError = e;
      if (outer?.aborted) throw e; // the caller cancelled on purpose: never retry
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
  }
  throw lastError;
};

export const supabase = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey, {
  global: { fetch: resilientFetch },
  auth: {
    storage,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
