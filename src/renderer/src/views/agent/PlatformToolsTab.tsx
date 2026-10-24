// src/renderer/src/views/agent/PlatformToolsTab.tsx
import { Chip } from '@/components/ui';
import { Empty, Loaded, OnOff, Panel, Row, TabPage, WebNote } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { apiGet } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface CatalogEntry { key: string; name: string; description: string }
interface State { key: string; enabled: boolean; available_to_members: boolean }
interface Data { catalog: CatalogEntry[]; states: Map<string, State>; catalogOk: boolean }

export function PlatformToolsTab({ agentId, ctx }: TabProps) {
  const state = useAsync<Data>(async () => {
    const [rows, catalog] = await Promise.all([
      supabase.from('agent_platform_tools').select('tool_key, enabled, available_to_members').eq('agent_id', agentId),
      apiGet<{ tools?: CatalogEntry[] }>('/api/platform-tools'),
    ]);
    if (rows.error) throw new Error('The platform tools could not be loaded.');
    const states = new Map<string, State>();
    for (const r of (rows.data ?? []) as { tool_key: string; enabled: boolean; available_to_members: boolean }[]) states.set(r.tool_key, { key: r.tool_key, enabled: r.enabled, available_to_members: r.available_to_members });
    const entries = catalog.ok && Array.isArray(catalog.data.tools) ? catalog.data.tools : [];
    return { catalog: entries, states, catalogOk: catalog.ok };
  }, [agentId]);

  return (
    <TabPage title="Platform Tools" subtitle="Ready-made abilities Parasync provides. Each one is off until the owner switches it on for this agent.">
      <Loaded state={state}>
        {(d) => {
          // If the catalog could not be read, still show what is known from this agent's own switches.
          const entries: CatalogEntry[] = d.catalog.length > 0 ? d.catalog : [...d.states.keys()].map((k) => ({ key: k, name: k.replace(/_/g, ' '), description: '' }));
          return (
            <>
              {!d.catalogOk && <p style={{ margin: 0, fontSize: 12.5, color: C.soft }}>The full list of tools could not be loaded, so only the ones with a saved setting are shown.</p>}
              <Panel>
                {entries.length === 0 ? <Empty>No platform tools found.</Empty> : entries.map((e, i) => {
                  const s = d.states.get(e.key);
                  return (
                    <Row
                      key={e.key} last={i === entries.length - 1}
                      primary={<>{e.name}<span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginLeft: 8 }}>{e.key}</span></>}
                      secondary={e.description || undefined}
                      right={<>{ctx.isOwner && ctx.agent.visibility !== 'personal' && s?.enabled && s.available_to_members && <Chip label="Users can use" tone="brass" />}<OnOff on={!!s?.enabled} /></>}
                    />
                  );
                })}
              </Panel>
            </>
          );
        }}
      </Loaded>
      <WebNote path={`/agents/${agentId}/platform-tools`}>Switching tools on or off, and choosing which ones connected people can use, is done in the web app for now.</WebNote>
    </TabPage>
  );
}
