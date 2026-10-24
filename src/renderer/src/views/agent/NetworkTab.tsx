// src/renderer/src/views/agent/NetworkTab.tsx
// "Add Users": who else can reach this agent. A private agent is shared by invite code; a public one through Discover (so only
// totals are shown, never who); a personal one is not shared.
import { useCallback, useEffect, useState } from 'react';

import { Button, Chip } from '@/components/ui';
import { Empty, Fact, Loaded, Panel, Row, TabPage, WebNote, dateTime, shortDate } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { apiGet } from '@/lib/api';
import { fmtCompact, fmtUsd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

const PAGE = 20;

interface Connection { id: string; status: 'active' | 'paused'; source: string; connected_at: string; email: string; usage: { calls: number; cost: number; lastActive: string | null }; tasks: { open: number; recurring: number } }
interface NetworkData { ok: boolean; connections: Connection[]; total: number; active: number; paused: number; totals: { calls: number; cost: number }; windowDays: number; hasMore?: boolean }
interface Invite { id: string; invited_email: string; code: string; status: string; created_at: string }

const INVITE_TONE: Record<string, 'brass' | 'green' | 'neutral' | 'red'> = { pending: 'brass', redeemed: 'green', revoked: 'neutral', rejected: 'red' };

export function NetworkTab({ agentId, ctx }: TabProps) {
  const visibility = ctx.agent.visibility;
  const [people, setPeople] = useState<Connection[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shownCode, setShownCode] = useState<string | null>(null);

  const state = useAsync<{ net: NetworkData | null; invites: Invite[] }>(async () => {
    if (visibility === 'personal') return { net: null, invites: [] };
    const [net, invites] = await Promise.all([
      apiGet<NetworkData>(`/api/agents/${agentId}/network`, { limit: PAGE, offset: 0 }),
      visibility === 'private' ? supabase.from('agent_invites').select('id, invited_email, code, status, created_at').eq('agent_id', agentId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    if (!net.ok) throw new Error(net.error);
    return { net: net.data, invites: ((invites.data ?? []) as Invite[]) };
  }, [agentId, visibility]);

  useEffect(() => { setPeople(state.data?.net?.connections ?? []); setHasMore(!!state.data?.net?.hasMore); }, [state.data]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const res = await apiGet<NetworkData>(`/api/agents/${agentId}/network`, { limit: PAGE, offset: people.length });
    if (res.ok) { setPeople((prev) => [...prev, ...res.data.connections]); setHasMore(!!res.data.hasMore); }
    setLoadingMore(false);
  }, [agentId, people.length]);

  return (
    <TabPage title="Add Users" subtitle="Who else can use this agent.">
      {visibility === 'personal' ? (
        <Panel><Empty>This agent is personal, so it is not shared. To share it, change its sharing to Private or Public in the web app.</Empty></Panel>
      ) : (
        <Loaded state={state}>
          {({ net, invites }) => net && (
            <>
              <Panel title="Overview">
                <Fact label="Connected" value={net.active} />
                <Fact label="Paused" value={net.paused} />
                <Fact label={`Use, last ${net.windowDays} days`} value={`${fmtCompact(net.totals.calls)} calls · ${fmtUsd(net.totals.cost)}`} last />
              </Panel>

              {visibility === 'private' && (
                <>
                  <Panel title="Invitations" subtitle="Each invitation has a code. You give the code to the person yourself; it is only shown here, to you.">
                    {invites.length === 0 ? <Empty>No invitations sent.</Empty> : invites.map((inv, i) => (
                      <Row
                        key={inv.id} last={i === invites.length - 1} primary={inv.invited_email} secondary={`Sent ${shortDate(inv.created_at)}`}
                        right={<>
                          {inv.status === 'pending' && (shownCode === inv.id
                            ? <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.08em', userSelect: 'text' }}>{inv.code}</span>
                            : <Button variant="secondary" label="Show code" onClick={() => setShownCode(inv.id)} />)}
                          <Chip label={inv.status} tone={INVITE_TONE[inv.status] ?? 'neutral'} />
                        </>}
                      />
                    ))}
                  </Panel>
                  <Panel title="People" subtitle="Everyone connected to this agent.">
                    {people.length === 0 ? <Empty>No one has joined yet.</Empty> : people.map((p, i) => (
                      <Row
                        key={p.id} last={i === people.length - 1 && !hasMore} primary={p.email}
                        secondary={`Joined ${shortDate(p.connected_at)} · ${p.usage.calls} call${p.usage.calls === 1 ? '' : 's'} · ${fmtUsd(p.usage.cost)}${p.usage.lastActive ? ` · last active ${dateTime(p.usage.lastActive)}` : ''}${p.tasks.open ? ` · ${p.tasks.open} open task${p.tasks.open === 1 ? '' : 's'}` : ''}`}
                        right={<Chip label={p.status} tone={p.status === 'active' ? 'green' : 'red'} />}
                      />
                    ))}
                    {hasMore && <div style={{ padding: 14, display: 'flex', justifyContent: 'center', borderTop: `1px solid ${C.line}` }}><Button variant="secondary" label="Load more" loading={loadingMore} onClick={() => void loadMore()} /></div>}
                  </Panel>
                </>
              )}
              {visibility === 'public' && <Panel><Empty>This agent is public, so people join from Discover. Only the totals above are shown, never who they are.</Empty></Panel>}
            </>
          )}
        </Loaded>
      )}
      <WebNote path={`/agents/${agentId}/network`}>Sending invitations, cancelling them and pausing someone are done in the web app for now.</WebNote>
    </TabPage>
  );
}
