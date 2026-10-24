// components/agent-profile/MemberProfileView.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgentListCtx } from '@/app/(shell)/agents/layout';
import ConfirmModal from '@/components/ConfirmModal';
import { useAgentCtx } from '@/app/(shell)/agents/[id]/layout';
import { createClient } from '@/lib/supabase/client';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Btn, Card, CardTitle, Chip, PageLoading, Stat } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate, fmtUsd } from '@/components/account/format';
import { AgentPage } from '@/components/agent-ui/AgentPage';
import { UsageCard } from './UsageCard';
import { UI_CSS } from './ui';

// What a connected person sees on the agent's Agent Profile: who they are talking to, how they are connected, what the
// agent can do for them, what they have used and who pays. Read-only; the agent's inner workings (persona, secrets,
// other tools) stay with its owner.

const USAGE_DAYS = 30;

interface MemberFacts {
  connectedAt: string | null;
  source: 'invite' | 'marketplace' | null;
  tools: { name: string; description: string | null }[];
  usage: { cost: number; calls: number } | null;
}

export function MemberProfileView() {
  const { agent, agentId, networkStatus } = useAgentCtx();
  const [facts, setFacts] = useState<MemberFacts | null>(null);
  const router = useRouter();
  const { refreshAgents } = useAgentListCtx();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  // Deletes this person's own chat history and connection for the agent (never the agent or anyone else's data).
  const disconnect = async () => {
    setLeaving(true); setLeaveError('');
    try {
      const res = await fetch(`/api/agent-network/${agentId}`, { method: 'DELETE' });
      if (res.ok) { refreshAgents(); router.replace('/agents'); return; }
      setLeaveError('Could not disconnect. Please try again.');
    } catch {
      setLeaveError('Could not disconnect. Please try again.');
    }
    setLeaving(false);
  };

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!cancelled) setFacts({ connectedAt: null, source: null, tools: [], usage: null }); return; }

      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (USAGE_DAYS - 1));
      const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
      const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();

      // The tools list is filtered by RLS to what the owner switched on for connected people.
      const [net, tools, builtTools, usageResp] = await Promise.all([
        supabase.from('agent_network').select('connected_at, source').eq('agent_id', agentId).eq('user_id', session.user.id).maybeSingle(),
        supabase.from('tools').select('name, description').eq('agent_id', agentId),
        supabase.from('agent_created_tools').select('name, description').eq('agent_id', agentId),
        supabase.rpc('account_usage_series', { p_scope: 'user', p_from: from.toISOString(), p_to: to.toISOString(), p_tz: tz }).range(0, 999),
      ]);
      const rows = ((usageResp.data as Record<string, unknown>[] | null) ?? []).filter(r => r.agent_id === agentId);
      const usage: MemberFacts['usage'] = usageResp.error ? null : rows.reduce<NonNullable<MemberFacts['usage']>>((t, r) => ({ cost: t.cost + (Number(r.cost) || 0), calls: t.calls + (Number(r.calls) || 0) }), { cost: 0, calls: 0 });
      if (cancelled) return;
      setFacts({
        connectedAt: (net.data as { connected_at: string } | null)?.connected_at ?? null,
        source: ((net.data as { source: 'invite' | 'marketplace' } | null)?.source) ?? null,
        // Tool Builder tools and agent-built ones together (RLS shows a member only what the owner switched on for them).
        tools: [
          ...((tools.data as { name: string; description: string | null }[] | null) ?? []),
          ...((builtTools.data as { name: string; description: string | null }[] | null) ?? []),
        ].sort((a, b) => a.name.localeCompare(b.name)),
        usage,
      });
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  if (!agent || !facts) return <AgentPage eyebrow="Agent profile" title="Agent profile" maxWidth={900}><PageLoading /></AgentPage>;

  const paused = networkStatus === 'paused';
  const kindChip = agent.visibility === 'private' ? <Chip tone="brass">Private</Chip> : agent.visibility === 'public' ? (agent.is_verified ? <Chip tone="green" dot>Public · verified</Chip> : <Chip tone="amber" dot>Public · in review</Chip>) : <Chip>Personal</Chip>;
  const payer = agent.visibility === 'public' && agent.billing_mode === 'user_pays'
    ? 'Your usage of this agent is charged to your own balance.'
    : 'Your usage of this agent is paid for by the agent’s owner. You are not charged for it.';

  return (
    <AgentPage eyebrow="Agent profile" title={agent.name} subtitle="Who you are talking to, and how you are connected." maxWidth={900}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <Card pad="1.5rem">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
            <AgentAvatar name={agent.name} avatarUrl={agent.avatar_url} size={80} fontSize="1.25rem" ring ringGap="#fff" />
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
                {kindChip}
                <Chip tone={paused ? 'amber' : 'green'} dot>{paused ? 'Access paused' : 'Connected'}</Chip>
              </div>
              {agent.bio && <p style={{ fontSize: '0.9rem', color: C.body, margin: 0, lineHeight: 1.55 }}>{agent.bio}</p>}
            </div>
            <Link href={`/agents/${agentId}`} style={{ background: C.ink, color: '#F7F6F2', textDecoration: 'none', fontSize: '0.82rem', padding: '0.55rem 1.1rem', borderRadius: 6 }}>Open chat</Link>
          </div>
          {agent.description && (
            <div style={{ margin: '1.2rem 0 0', paddingTop: '1.1rem', borderTop: `1px solid ${C.lineSoft}` }}>
              <p style={{ fontSize: '0.86rem', color: C.body, lineHeight: 1.7, margin: 0, maxWidth: 680 }}>{agent.description}</p>
            </div>
          )}
        </Card>

        {paused && (
          <p role="status" style={{ fontSize: '0.82rem', color: C.red, background: C.redWash, border: `1px solid ${C.redLine}`, borderRadius: 8, padding: '0.8rem 1rem', margin: 0, lineHeight: 1.6 }}>
            The agent’s owner has paused your access. You can still read your history, but new messages won’t be answered until they resume it.
          </p>
        )}

        <Card pad="0" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div style={{ padding: '1.1rem 1.4rem' }}><Stat label="Connected since" value={facts.connectedAt ? fmtDate(facts.connectedAt) : '—'} valueSize="1.15rem" /></div>
            <div style={{ padding: '1.1rem 1.4rem', borderLeft: `1px solid ${C.lineSoft}` }}><Stat label="How you joined" value={facts.source === 'invite' ? 'By invitation' : facts.source === 'marketplace' ? 'From the Marketplace' : '—'} valueSize="1.15rem" /></div>
            <div style={{ padding: '1.1rem 1.4rem', borderLeft: `1px solid ${C.lineSoft}` }}><Stat label={`Your usage · ${USAGE_DAYS} days`} value={facts.usage ? fmtUsd(facts.usage.cost) : '—'} valueSize="1.15rem" /></div>
            <div style={{ padding: '1.1rem 1.4rem', borderLeft: `1px solid ${C.lineSoft}` }}><Stat label="Model calls" value={facts.usage ? facts.usage.calls.toLocaleString() : '—'} valueSize="1.15rem" /></div>
          </div>
          <p style={{ fontSize: '0.76rem', color: C.soft, margin: 0, padding: '0.85rem 1.4rem', borderTop: `1px solid ${C.lineSoft}`, background: C.paper, lineHeight: 1.55 }}>{payer}</p>
        </Card>

        <style>{UI_CSS}</style>
        <UsageCard agentId={agentId} visibility={agent.visibility} owner={false} />

        {facts.tools.length > 0 && (
          <Card>
            <CardTitle aside={agent.visibility === 'private' ? undefined : <Link href={`/agents/${agentId}/tools`} style={{ fontSize: '0.72rem', color: C.soft, textDecoration: 'underline' }}>Tools tab</Link>}>What it can do for you</CardTitle>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.7rem' }}>
              {facts.tools.map(t => (
                <li key={t.name} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: '0.7rem 0.85rem', background: C.paper, minWidth: 0 }}>
                  <p style={{ fontFamily: MONO, fontSize: '0.74rem', color: C.brassDeep, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</p>
                  {t.description && <p style={{ fontSize: '0.76rem', color: C.soft, margin: '0.3rem 0 0', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 500, color: C.ink, margin: 0 }}>Disconnect from this agent</p>
              <p style={{ fontSize: '0.78rem', color: C.soft, margin: '0.3rem 0 0', lineHeight: 1.6 }}>
                Removes it from My Agents and deletes your chat history and files with it. The agent and other people&apos;s data aren&apos;t affected.
              </p>
            </div>
            <Btn onClick={() => { setLeaveError(''); setConfirming(true); }} style={{ color: C.red }}>Disconnect</Btn>
          </div>
        </Card>
      </div>

      {confirming && (
        <ConfirmModal
          eyebrow="Disconnect from this agent"
          title={`Disconnect from ${agent.name}?`}
          message={leaveError || 'It will be removed from My Agents and your chat history with it will be deleted. This cannot be undone.'}
          confirmLabel="Disconnect"
          pendingLabel="Disconnecting…"
          loading={leaving}
          onClose={() => { if (!leaving) setConfirming(false); }}
          onConfirm={disconnect}
        />
      )}
    </AgentPage>
  );
}
