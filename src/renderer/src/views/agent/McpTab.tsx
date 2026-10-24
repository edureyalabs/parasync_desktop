// src/renderer/src/views/agent/McpTab.tsx
import { useState } from 'react';

import { Chip } from '@/components/ui';
import { Empty, Loaded, OnOff, Panel, Row, TabPage, WebNote, dateTime } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface McpRow {
  id: string; name: string; url: string; auth_type: string; enabled: boolean; available_to_members: boolean;
  tools_cache: unknown; tools_cached_at: string | null; oauth_expires_at: string | null; needs_reconnect: boolean | null;
}

const AUTH: Record<string, string> = { oauth: 'Signs in (OAuth)', bearer: 'Bearer token', header: 'Custom header', none: 'No sign-in' };

/** The last-known tool names of a server (the stored catalog is untyped JSON, so read it defensively). */
function toolNames(cache: unknown): { name: string; description: string }[] {
  if (!Array.isArray(cache)) return [];
  return cache.flatMap((t) => (t && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string'
    ? [{ name: (t as { name: string }).name, description: typeof (t as { description?: unknown }).description === 'string' ? (t as { description: string }).description : '' }] : []));
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export function McpTab({ agentId, ctx }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  // The address, name and sign-in type only: the stored credentials are never requested.
  const state = useAsync<McpRow[]>(async () => {
    const { data, error } = await supabase.from('agent_mcp_servers').select('id, name, url, auth_type, enabled, available_to_members, tools_cache, tools_cached_at, oauth_expires_at, needs_reconnect').eq('agent_id', agentId).order('name', { ascending: true });
    if (error) throw new Error('The MCP servers could not be loaded.');
    return (data ?? []) as McpRow[];
  }, [agentId]);

  return (
    <TabPage title="MCP" subtitle="External tool servers (Model Context Protocol). Their tools join this agent's toolbelt.">
      <Loaded state={state}>
        {(rows) => (
          <Panel>
            {rows.length === 0 ? <Empty>No MCP servers added.</Empty> : rows.map((r, i) => {
              const tools = toolNames(r.tools_cache);
              const expanded = open === r.id;
              return (
                <div key={r.id} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line}` }}>
                  <Row
                    last primary={r.name} onClick={tools.length > 0 ? () => setOpen(expanded ? null : r.id) : undefined}
                    secondary={<><span style={{ fontFamily: MONO }}>{hostOf(r.url)}</span> · {AUTH[r.auth_type] ?? r.auth_type} · {tools.length} tool{tools.length === 1 ? '' : 's'}{r.tools_cached_at ? ` (checked ${dateTime(r.tools_cached_at)})` : ''}</>}
                    right={<>
                      {r.needs_reconnect && <Chip label="Needs reconnect" tone="red" />}
                      {r.available_to_members && ctx.agent.visibility !== 'personal' && <Chip label="Users can use" tone="brass" />}
                      <OnOff on={r.enabled} />
                    </>}
                  />
                  {expanded && (
                    <div style={{ padding: '0 18px 14px' }}>
                      {tools.map((t) => (
                        <div key={t.name} style={{ padding: '6px 0', fontSize: 13 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12.5 }}>{t.name}</span>
                          {t.description && <span style={{ color: C.soft }}> — {t.description.length > 140 ? `${t.description.slice(0, 140)}…` : t.description}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Panel>
        )}
      </Loaded>
      <WebNote path={`/agents/${agentId}/mcp`}>Adding a server, signing in to it and refreshing its tools is done in the web app for now.</WebNote>
    </TabPage>
  );
}
