// src/renderer/src/hooks/useVault.ts
// What this PC holds for the signed-in person (names, dates, never a value), joined with the names of the agents so the list can say which
// agent each one belongs to.
import { useCallback, useEffect, useState } from 'react';

import type { Ref, VaultMeta } from '@shared/vault';

import { announceVaultChanged, onVaultChanged } from '~/lib/localCopy';
import { supabase } from '~/lib/supabase';

export interface VaultRow extends VaultMeta {
  agentName: string;
  /** For a saved login: the name the owner gave it. */
  label: string;
}

async function describe(entries: VaultMeta[]): Promise<VaultRow[]> {
  const agentIds = [...new Set(entries.map((e) => e.agentId))];
  const names = new Map<string, string>();
  const logins = new Map<string, string>();
  if (agentIds.length > 0) {
    const [agents, accesses] = await Promise.all([
      supabase.from('agents').select('id, name').in('id', agentIds),
      supabase.from('browser_accesses').select('id, label, name').in('agent_id', agentIds),
    ]);
    for (const a of agents.data ?? []) names.set(a.id as string, a.name as string);
    for (const x of accesses.data ?? []) logins.set(x.id as string, (x.label ?? x.name) as string);
  }
  return entries.map((e) => ({ ...e, agentName: names.get(e.agentId) ?? 'an agent', label: logins.get(e.name) ?? e.name }));
}

export function useVault() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [info, list] = await Promise.all([window.parasync.vault.info(), window.parasync.vault.list()]);
      setAvailable(info.available);
      setRows(await describe(list).catch(() => list.map((e) => ({ ...e, agentName: 'an agent', label: e.name }))));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); return onVaultChanged(() => { void refresh(); }); }, [refresh]);

  return {
    available, rows, loading,
    remove: async (ref: Ref) => { await window.parasync.vault.remove(ref); announceVaultChanged(); },
    wipe: async () => { await window.parasync.vault.wipe(); announceVaultChanged(); },
  };
}
