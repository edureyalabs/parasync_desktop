// src/renderer/src/hooks/useVault.ts
// What this PC holds for the signed-in person (names, versions, dates; never a value), joined with the names of the agents and what the cloud
// currently has, so the screen can say whether each copy is current.
import { useCallback, useEffect, useState } from 'react';

import type { PutInput, Ref, VaultMeta, VerifyResult } from '@shared/vault';

import { supabase } from '~/lib/supabase';

export type CloudState = 'same' | 'newer' | 'gone' | 'pc-only' | 'unknown';

export interface VaultRow extends VaultMeta {
  agentName: string;
  /** For a saved login: the name the owner gave it. */
  label: string;
  cloud: CloudState;
}

export const keyOf = (r: Ref): string => `${r.agentId}|${r.kind}|${r.name}`;

async function describe(entries: VaultMeta[]): Promise<VaultRow[]> {
  const agentIds = [...new Set(entries.map((e) => e.agentId))];
  const names = new Map<string, string>();
  const secrets = new Map<string, { version: number; storage: string }>();
  const keys = new Map<string, { version: number; storage: string }>();
  const logins = new Map<string, { label: string; version: number; storage: string | null }>();
  if (agentIds.length > 0) {
    const [agents, adminSecrets, ownKeys, accesses] = await Promise.all([
      supabase.from('agents').select('id, name').in('id', agentIds),
      supabase.from('secrets').select('agent_id, name, version, storage').in('agent_id', agentIds),
      supabase.from('agent_user_secrets').select('agent_id, name, version, storage').in('agent_id', agentIds),
      supabase.from('browser_accesses').select('id, label, name, credentials_version, credentials_storage').in('agent_id', agentIds),
    ]);
    for (const a of agents.data ?? []) names.set(a.id as string, a.name as string);
    for (const s of adminSecrets.data ?? []) secrets.set(`${s.agent_id}|${s.name}`, { version: s.version as number, storage: s.storage as string });
    for (const s of ownKeys.data ?? []) keys.set(`${s.agent_id}|${s.name}`, { version: s.version as number, storage: s.storage as string });
    for (const x of accesses.data ?? []) logins.set(x.id as string, { label: (x.label ?? x.name) as string, version: x.credentials_version as number, storage: (x.credentials_storage as string | null) ?? null });
  }
  return entries.map((e) => {
    const cloudRow = e.kind === 'secret' ? secrets.get(`${e.agentId}|${e.name}`) : e.kind === 'user_secret' ? keys.get(`${e.agentId}|${e.name}`) : undefined;
    const login = e.kind === 'browser_access' ? logins.get(e.name) : undefined;
    let cloud: CloudState = 'unknown';
    if (e.deviceOnly) cloud = 'pc-only';
    else if (login) cloud = login.version === 0 ? 'gone' : login.version === e.version ? 'same' : login.version > e.version ? 'newer' : 'unknown';
    else if (cloudRow) cloud = cloudRow.version === e.version ? 'same' : cloudRow.version > e.version ? 'newer' : 'unknown';
    else if (e.kind !== 'user_secret') cloud = 'unknown'; // a member cannot always read the cloud's row: say nothing rather than guess
    return { ...e, agentName: names.get(e.agentId) ?? 'an agent', label: login?.label ?? e.name, cloud };
  });
}

export function useVault() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, VerifyResult | 'checking'>>({});

  const refresh = useCallback(async () => {
    try {
      const [info, list] = await Promise.all([window.parasync.vault.info(), window.parasync.vault.list()]);
      setAvailable(info.available);
      setRows(await describe(list).catch(() => list.map((e) => ({ ...e, agentName: 'an agent', label: e.name, cloud: 'unknown' as CloudState }))));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    available, rows, loading, results, refresh,
    put: async (input: PutInput) => { const meta = await window.parasync.vault.put(input); await refresh(); return meta; },
    remove: async (ref: Ref) => { await window.parasync.vault.remove(ref); await refresh(); },
    wipe: async () => { await window.parasync.vault.wipe(); setResults({}); await refresh(); },
    verify: async (ref: Ref) => {
      const key = keyOf(ref);
      setResults((r) => ({ ...r, [key]: 'checking' }));
      const answer = await window.parasync.vault.verify(ref);
      setResults((r) => ({ ...r, [key]: answer }));
    },
  };
}
