// src/renderer/src/views/agent/BrowserAccessTab.tsx
import { Chip } from '@/components/ui';
import { Empty, Loaded, OnOff, Panel, Row, TabPage, WebNote, dateTime } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface AccessRow {
  id: string; name: string; label: string | null; host: string | null; status: string; enabled: boolean; available_to_members: boolean;
  coverage_pct: number | null; last_verified_at: string | null; last_error: string | null;
}

const STATUS: Record<string, { text: string; tone: 'green' | 'brass' | 'red' | 'neutral' | 'blue' }> = {
  draft: { text: 'Not set up', tone: 'neutral' }, onboarding: { text: 'Setting up', tone: 'blue' }, awaiting_credentials: { text: 'Needs your details', tone: 'brass' },
  ready: { text: 'Ready', tone: 'green' }, failed: { text: 'Needs attention', tone: 'red' }, disabled: { text: 'Off', tone: 'neutral' },
};

export function BrowserAccessTab({ agentId, ctx }: TabProps) {
  // The saved sign-in form fields and the learned recipe are never requested: only what is needed to list the sites.
  const state = useAsync<AccessRow[]>(async () => {
    const { data, error } = await supabase.from('browser_accesses').select('id, name, label, host, status, enabled, available_to_members, coverage_pct, last_verified_at, last_error').eq('agent_id', agentId).order('created_at', { ascending: true });
    if (error) throw new Error('The browser sites could not be loaded.');
    return (data ?? []) as AccessRow[];
  }, [agentId]);

  return (
    <TabPage title="Browser Access" subtitle="Websites the agent may sign in to and use, on your behalf. Only the sites listed here can be reached.">
      <Loaded state={state}>
        {(rows) => (
          <Panel>
            {rows.length === 0 ? <Empty>No sites added yet.</Empty> : rows.map((r, i) => {
              const s = STATUS[r.status] ?? { text: r.status, tone: 'neutral' as const };
              return (
                <Row
                  key={r.id} last={i === rows.length - 1} primary={r.label || r.name}
                  secondary={<>
                    <span style={{ fontFamily: MONO }}>{r.host ?? '—'}</span>
                    {r.coverage_pct !== null ? ` · ${Math.round(r.coverage_pct)}% of the site learned` : ''}
                    {r.last_verified_at ? ` · verified ${dateTime(r.last_verified_at)}` : ''}
                    {r.last_error && <span style={{ display: 'block', color: C.red, marginTop: 2 }}>{r.last_error.length > 180 ? `${r.last_error.slice(0, 180)}…` : r.last_error}</span>}
                  </>}
                  right={<>{r.available_to_members && ctx.agent.visibility !== 'personal' && <Chip label="Users can use" tone="brass" />}<Chip label={s.text} tone={s.tone} />{ctx.isOwner && <OnOff on={r.enabled} />}</>}
                />
              );
            })}
          </Panel>
        )}
      </Loaded>
      <WebNote path={`/agents/${agentId}/browser-access`}>Adding a site, entering its login in the secure form and the learning runs are done in the web app for now.</WebNote>
    </TabPage>
  );
}
