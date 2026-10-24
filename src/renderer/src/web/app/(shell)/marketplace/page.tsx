// app/(shell)/marketplace/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AgentAvatar } from '@/components/AgentAvatar';

interface MarketplaceAgent {
  id:          string;
  name:        string;
  description: string | null;
  org_name:    string;
  avatar_url:  string | null;
  created_at:  string;
}

function Spinner({ size = 18, color = '#26251E' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{
        width: size, height: size,
        border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`,
        borderTopColor: color, borderRadius: '50%',
        animation: 'spin 0.8s linear infinite', flexShrink: 0,
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

function MarketplaceCard({ agent, connectedIds, onConnected }: {
  agent:         MarketplaceAgent;
  connectedIds:  Set<string>;
  onConnected:   (id: string) => void;
}) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const alreadyConnected = connectedIds.has(agent.id);

  const handleConnect = async () => {
    setConnecting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('connect_public_agent', { p_agent_id: agent.id });
    setConnecting(false);
    if (!error) onConnected(agent.id);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <AgentAvatar name={agent.name} avatarUrl={agent.avatar_url} size={36} />
        <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: 0, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</p>
      </div>

      {agent.description
        ? <p style={{ fontSize: '0.82rem', color: '#3A3830', fontWeight: 300, margin: 0, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{agent.description}</p>
        : <p style={{ fontSize: '0.82rem', color: '#9E9C8F', margin: 0, fontStyle: 'italic' }}>No description</p>
      }

      <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #E2DFD3' }}>
        {alreadyConnected ? (
          <button onClick={() => router.push(`/agents/${agent.id}`)} style={{ width: '100%', background: '#EDEBE2', color: '#3A3830', border: 'none', padding: '0.5rem', fontSize: '0.8rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6.5l2.5 2.5L10 3" stroke="#3C7E6A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Connected
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{ width: '100%', background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.5rem', fontSize: '0.8rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            {connecting && <Spinner size={12} color="#fff" />}
            {connecting ? 'Adding…' : 'Add to Network'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }

      const [{ data: listed }, { data: mine }] = await Promise.all([
        supabase.from('marketplace_agents').select('*').order('created_at', { ascending: false }),
        supabase.from('agent_network').select('agent_id').eq('user_id', session.user.id),
      ]);

      setAgents((listed as MarketplaceAgent[]) ?? []);
      setConnectedIds(new Set((mine ?? []).map((r) => r.agent_id)));
      setLoading(false);
    })();
  }, [router]);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
      <Spinner />
    </div>
  );

  const filtered = query.trim()
    ? agents.filter(a =>
        a.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        (a.description ?? '').toLowerCase().includes(query.trim().toLowerCase()))
    : agents;

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: '#F7F6F2', fontFamily: "'Inter', 'Helvetica Neue', sans-serif", color: '#26251E' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .mp-search { width: 100%; max-width: 320px; padding: 0.55rem 0.8rem; font-size: 0.85rem; font-family: 'Inter', sans-serif; color: #26251E; background: #fff; border: 1px solid #DAD5C5; border-radius: 4px; outline: none; transition: border-color 0.15s; }
        .mp-search:focus { border-color: #26251E; }
        .mp-search::placeholder { color: #9E9C8F; }
      `}</style>

      <main style={{ padding: '3rem 3rem 4rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.7rem', color: '#67655A', letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>Discover Agents</p>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.03em', margin: 0, color: '#26251E' }}>Add an agent to your network</h1>
            <p style={{ fontSize: '0.85rem', color: '#67655A', margin: '0.5rem 0 0', fontWeight: 300 }}>
              Public agents anyone on the platform can connect to and start chatting with.
            </p>
          </div>
          <input
            className="mp-search"
            type="text"
            placeholder="Search agents…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {agents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 0' }}>
            <p style={{ fontSize: '0.9rem', color: '#9E9C8F', margin: 0 }}>No public agents yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 0' }}>
            <p style={{ fontSize: '0.9rem', color: '#9E9C8F', margin: 0 }}>No agents match &ldquo;{query}&rdquo;.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {filtered.map(a => (
              <MarketplaceCard
                key={a.id}
                agent={a}
                connectedIds={connectedIds}
                onConnected={id => setConnectedIds(prev => new Set(prev).add(id))}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
