// src/renderer/src/views/agent/ToolsTab.tsx
import { useState } from 'react';

import { Chip } from '@/components/ui';
import { Empty, Loaded, OnOff, Panel, Row, TabPage, WebNote } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface ToolRow {
  id: string;
  name: string;
  description: string | null;
  config: { variables?: { name: string; data_type?: string; required?: boolean }[]; code?: string; timeout_seconds?: number } | null;
  enabled: boolean;
  available_to_members?: boolean;
  usage_count?: number;
}

interface Tools {
  builder: ToolRow[];
  agentMade: ToolRow[];
}

function inputsOf(t: ToolRow): string {
  const vars = t.config?.variables ?? [];
  return vars.length === 0 ? 'No inputs' : `Inputs: ${vars.map((v) => `${v.name}${v.required === false ? '?' : ''}`).join(', ')}`;
}

export function ToolsTab({ agentId, ctx }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const state = useAsync<Tools>(async () => {
    const [tools, made] = await Promise.all([
      supabase.from('tools').select('id, name, description, config, enabled, available_to_members').eq('agent_id', agentId).order('name', { ascending: true }),
      ctx.isOwner ? supabase.from('agent_created_tools').select('id, name, description, config, enabled, available_to_members, usage_count').eq('agent_id', agentId).order('name', { ascending: true }) : Promise.resolve({ data: [], error: null }),
    ]);
    if (tools.error) throw new Error('The tools could not be loaded.');
    return { builder: (tools.data ?? []) as ToolRow[], agentMade: (made.data ?? []) as ToolRow[] };
  }, [agentId, ctx.isOwner]);

  const list = (rows: ToolRow[], emptyText: string) => (
    <Panel>
      {rows.length === 0 ? <Empty>{emptyText}</Empty> : rows.map((t, i) => {
        const expanded = open === t.id;
        // The code is the owner's own work; a connected person only ever sees what each tool is for.
        const canSeeCode = ctx.isOwner && !!t.config?.code;
        return (
          <div key={t.id} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line}` }}>
            <Row
              last primary={<span style={{ fontFamily: MONO, fontSize: 13 }}>{t.name}</span>} secondary={t.description || 'No description'}
              onClick={canSeeCode ? () => setOpen(expanded ? null : t.id) : undefined}
              right={ctx.isOwner ? <>{typeof t.usage_count === 'number' && <Chip label={`Used ${t.usage_count}×`} />}{t.available_to_members && ctx.agent.visibility !== 'personal' && <Chip label="Users can run" tone="brass" />}<OnOff on={t.enabled} /></> : undefined}
            />
            {expanded && (
              <div style={{ padding: '0 18px 16px' }}>
                <div style={{ fontSize: 12.5, color: C.soft, marginBottom: 8 }}>{inputsOf(t)}{t.config?.timeout_seconds ? ` · stops after ${t.config.timeout_seconds}s` : ''}</div>
                <pre style={{ margin: 0, background: C.ink, color: C.bg, borderRadius: 8, padding: '12px 14px', fontFamily: MONO, fontSize: 12, lineHeight: 1.55, overflowX: 'auto', maxHeight: 360 }}>{t.config?.code}</pre>
              </div>
            )}
          </div>
        );
      })}
    </Panel>
  );

  return (
    <TabPage title={ctx.isOwner ? 'Tool Builder' : 'Tools'} subtitle={ctx.isOwner ? 'Tools you wrote for this agent, and ones it built for itself.' : 'What this agent can do for you with its own tools.'}>
      <Loaded state={state}>
        {(t) => (
          <>
            {list(t.builder, ctx.isOwner ? 'No tools yet. Build one in the web app.' : 'The owner has not shared any tools of their own.')}
            {ctx.isOwner && (
              <>
                <h2 style={{ margin: '8px 0 -6px', fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.muted }}>Built by the agent</h2>
                {list(t.agentMade, 'The agent has not saved any tools of its own yet.')}
              </>
            )}
          </>
        )}
      </Loaded>
      {ctx.isOwner && <WebNote path={`/agents/${agentId}/tools`}>Writing, testing and switching tools is done in the web app for now (the guided Tool Builder).</WebNote>}
    </TabPage>
  );
}
