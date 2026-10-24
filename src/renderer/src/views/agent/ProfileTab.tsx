// src/renderer/src/views/agent/ProfileTab.tsx
import { Avatar, Chip } from '@/components/ui';
import { Fact, Loaded, Panel, TabPage, WebNote, shortDate } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { fmtCompact, fmtUsd } from '@/lib/format';
import { planLine } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

const USAGE_DAYS = 30;

interface Summary {
  counts: { tools: number; platformTools: number; instructions: number; mcp: number; signedApis: number; secrets: number; openTasks: number; shifts: number };
  network: { active: number; paused: number; pending: number };
  usage: { cost: number; calls: number; tokens: number } | null;
  periodEnd: string | null;
}

async function usageFor(agentId: string, scope: 'payer' | 'user'): Promise<Summary['usage']> {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (USAGE_DAYS - 1));
  const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  const { data, error } = await supabase.rpc('account_usage_series', { p_scope: scope, p_from: from.toISOString(), p_to: to.toISOString(), p_tz: tz }).range(0, 999);
  if (error) return null;
  return ((data as Record<string, unknown>[] | null) ?? []).filter((r) => r.agent_id === agentId).reduce<NonNullable<Summary['usage']>>(
    (t, r) => ({ cost: t.cost + (Number(r.cost) || 0), calls: t.calls + (Number(r.calls) || 0), tokens: t.tokens + (Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0) }),
    { cost: 0, calls: 0, tokens: 0 },
  );
}

const VIS: Record<string, string> = { personal: 'Personal', private: 'Private (by invite)', public: 'Public (on Discover)' };

export function ProfileTab({ agentId, ctx }: TabProps) {
  const { agent, isOwner, network } = ctx;

  const summary = useAsync<Summary | null>(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id ?? '';
    const head = (table: string) => supabase.from(table).select('*', { count: 'exact', head: true }).eq('agent_id', agentId);
    const n = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    if (!isOwner) return { counts: { tools: 0, platformTools: 0, instructions: 0, mcp: 0, signedApis: 0, secrets: 0, openTasks: 0, shifts: 0 }, network: { active: 0, paused: 0, pending: 0 }, usage: await usageFor(agentId, 'user'), periodEnd: null };
    const [tools, platformTools, instructions, mcp, signedApis, secrets, openTasks, shifts, active, paused, pending, usage, sub] = await Promise.all([
      n(head('tools').eq('enabled', true)), n(head('agent_platform_tools').eq('enabled', true)), n(head('instructions').eq('enabled', true)),
      n(head('agent_mcp_servers').eq('enabled', true)), n(head('agent_signed_apis').eq('enabled', true)), n(head('secrets')),
      n(head('tasks').eq('created_by', uid).not('status', 'in', '(completed,cancelled,failed)')),
      n(head('shifts').eq('created_by', uid).in('status', ['pending', 'planning', 'planned'])),
      n(head('agent_network').eq('status', 'active')), n(head('agent_network').eq('status', 'paused')), n(head('agent_invites').eq('status', 'pending')),
      usageFor(agentId, 'payer'),
      supabase.from('agent_subscriptions').select('current_period_end').eq('agent_id', agentId).maybeSingle(),
    ]);
    return { counts: { tools, platformTools, instructions, mcp, signedApis, secrets, openTasks, shifts }, network: { active, paused, pending }, usage, periodEnd: (sub.data as { current_period_end: string | null } | null)?.current_period_end ?? null };
  }, [agentId, isOwner]);

  const plan = planLine(summary.data?.periodEnd ?? null, agent.visibility);

  return (
    <TabPage title="Agent Profile" subtitle={isOwner ? 'Who this agent is, what it is equipped with, and what it costs.' : 'About this agent and your own use of it.'}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 20 }}>
          <Avatar name={agent.name} url={agent.avatar_url} size={72} ring />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em' }}>{agent.name}</div>
            {agent.handle && <div style={{ fontFamily: MONO, fontSize: 12, color: C.brassDeep, marginTop: 2 }}>@{agent.handle}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <Chip label={VIS[agent.visibility] ?? agent.visibility} tone="brass" />
              <Chip label={agent.active ? 'Switched on' : 'Switched off'} tone={agent.active ? 'green' : 'neutral'} />
              {agent.is_verified && <Chip label="Verified" tone="blue" />}
              {network?.status === 'paused' && <Chip label="Your access is paused" tone="red" />}
            </div>
          </div>
        </div>
        {agent.bio && <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 14, color: C.text, lineHeight: 1.6 }}>{agent.bio}</p>}
      </Panel>

      <Panel title="Details">
        <Fact label="Description" value={agent.description || '—'} />
        {isOwner && <Fact label="Role" value={agent.role || '—'} />}
        {isOwner && <Fact label="Goal" value={agent.goal || '—'} />}
        <Fact label="Sharing" value={VIS[agent.visibility] ?? agent.visibility} />
        {isOwner && agent.visibility !== 'personal' && <Fact label="Who pays for usage" value={agent.billing_mode === 'owner_pays' ? 'You (the owner)' : 'Each person who uses it'} />}
        <Fact label="Created" value={shortDate(agent.created_at)} />
        {!isOwner && network && <Fact label="You connected" value={shortDate(network.connected_at)} />}
        <Fact last label={isOwner ? 'Plan' : 'Your access'} value={isOwner ? <Chip label={plan.text} tone={plan.tone} /> : <Chip label={network?.status === 'paused' ? 'Paused' : 'Active'} tone={network?.status === 'paused' ? 'red' : 'green'} />} />
      </Panel>

      {isOwner && agent.backstory && (
        <Panel title="Persona" subtitle="The background the agent is given on every turn.">
          <p style={{ margin: 0, padding: '14px 18px', fontSize: 13.5, color: C.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{agent.backstory}</p>
        </Panel>
      )}

      <Loaded state={summary}>
        {(s) => (
          <>
            {isOwner && s && (
              <Panel title="At a glance">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                  {([
                    ['Tools on', s.counts.tools], ['Platform tools on', s.counts.platformTools], ['Instructions on', s.counts.instructions],
                    ['MCP servers on', s.counts.mcp], ['Database integrations', s.counts.signedApis], ['Secrets stored', s.counts.secrets],
                    ['Your open tasks', s.counts.openTasks], ['Your shifts', s.counts.shifts],
                    ['People connected', s.network.active], ['People paused', s.network.paused], ['Invites pending', s.network.pending],
                  ] as const).map(([label, value]) => (
                    <div key={label} style={{ padding: '14px 18px', borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{value}</div>
                      <div style={{ fontSize: 12, color: C.soft, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
            <Panel title={isOwner ? `Spend, last ${USAGE_DAYS} days` : `Your use, last ${USAGE_DAYS} days`}>
              {s?.usage ? (
                <>
                  <Fact label="Cost" value={fmtUsd(s.usage.cost)} />
                  <Fact label="Model calls" value={fmtCompact(s.usage.calls)} />
                  <Fact last label="Tokens" value={fmtCompact(s.usage.tokens)} />
                </>
              ) : <p style={{ margin: 0, padding: '14px 18px', fontSize: 13, color: C.soft }}>Usage could not be loaded.</p>}
            </Panel>
          </>
        )}
      </Loaded>

      {isOwner && <WebNote path={`/agents/${agentId}/settings`}>Editing the name, photo, persona and sharing is done in the web app for now.</WebNote>}
    </TabPage>
  );
}
