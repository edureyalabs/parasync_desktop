// src/renderer/src/views/DiscoverView.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Avatar, Button, Center, Chip, EmptyState, ErrorText, PageHeader, SearchField, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { MarketplaceAgent } from '@/lib/types';

/** Public agents anyone can add to their network. */
export function DiscoverView() {
  const { session } = useAuth();
  const { openAgent } = useNav();
  const [agents, setAgents] = useState<MarketplaceAgent[] | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    const [listed, mine] = await Promise.all([
      supabase.from('marketplace_agents').select('*').order('created_at', { ascending: false }),
      supabase.from('agent_network').select('agent_id').eq('user_id', session.user.id),
    ]);
    if (listed.error) { setError('Could not load agents. Check your connection and try again.'); setAgents((a) => a ?? []); return; }
    setError(null);
    setAgents((listed.data as MarketplaceAgent[]) ?? []);
    setConnected(new Set((mine.data ?? []).map((r) => r.agent_id as string)));
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const connect = async (id: string) => {
    setBusyId(id);
    const { error: err } = await supabase.rpc('connect_public_agent', { p_agent_id: id });
    setBusyId(null);
    if (err) setError('Could not add this agent. Please try again.');
    else { setError(null); setConnected((prev) => new Set(prev).add(id)); }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !agents) return agents ?? [];
    return agents.filter((a) => a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q));
  }, [agents, query]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
      <PageHeader title="Discover Agents" subtitle="Public agents you can add to your network">
        <div style={{ marginTop: 14, maxWidth: 420 }}><SearchField value={query} onChange={setQuery} placeholder="Search agents" /></div>
      </PageHeader>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {error && <div style={{ marginBottom: 14 }}><ErrorText>{error}</ErrorText></div>}
        {agents === null ? (
          <Center><Spinner size={24} /></Center>
        ) : filtered.length === 0 ? (
          <EmptyState title="No public agents" body={query ? 'Nothing matches your search.' : 'No public agents are listed yet.'} icon="store" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {filtered.map((a) => {
              const added = connected.has(a.id);
              return (
                <article key={a.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Avatar name={a.name} url={a.avatar_url} size={48} ring />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: C.soft }}>{a.org_name}</div>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: a.description ? C.muted : C.faint, fontStyle: a.description ? 'normal' : 'italic', flex: 1 }}>{a.description || 'No description'}</p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                    {added ? (
                      <>
                        <Chip label="In your network" tone="green" />
                        <Button variant="secondary" label="Open chat" onClick={() => openAgent(a.id)} />
                      </>
                    ) : (
                      <Button label="Add to network" loading={busyId === a.id} onClick={() => void connect(a.id)} />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
