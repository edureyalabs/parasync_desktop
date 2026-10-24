// src/renderer/src/views/agent/InstructionsTab.tsx
import { useState } from 'react';

import { Chip } from '@/components/ui';
import { Empty, Loaded, OnOff, Panel, Row, TabPage, WebNote, shortDate } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface InstructionRow {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  available_to_members: boolean;
  created_at: string;
}

export function InstructionsTab({ agentId, ctx }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const state = useAsync<InstructionRow[]>(async () => {
    const { data, error } = await supabase.from('instructions').select('id, title, content, enabled, available_to_members, created_at').eq('agent_id', agentId).order('created_at', { ascending: true });
    if (error) throw new Error('The instructions could not be loaded.');
    return (data ?? []) as InstructionRow[];
  }, [agentId]);

  return (
    <TabPage title="Instructions" subtitle={ctx.isOwner ? 'Saved guidance the agent follows on every turn, while it is switched on.' : 'Guidance the owner has shared with you for this agent.'}>
      <Loaded state={state}>
        {(rows) => (
          <Panel>
            {rows.length === 0 ? <Empty>No instructions yet.</Empty> : rows.map((r, i) => {
              const expanded = open === r.id;
              return (
                <div key={r.id} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line}` }}>
                  <Row
                    primary={r.title || 'Untitled'} secondary={`Added ${shortDate(r.created_at)}`} onClick={() => setOpen(expanded ? null : r.id)} last
                    right={<>{ctx.isOwner && <OnOff on={r.enabled} />}{ctx.isOwner && ctx.agent.visibility !== 'personal' && r.available_to_members && <Chip label="Shared with users" tone="brass" />}</>}
                  />
                  {expanded && <p style={{ margin: 0, padding: '0 18px 16px', fontSize: 13.5, color: C.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{r.content}</p>}
                </div>
              );
            })}
          </Panel>
        )}
      </Loaded>
      {ctx.isOwner && <WebNote path={`/agents/${agentId}/instructions`}>Writing and switching instructions on or off is done in the web app for now.</WebNote>}
    </TabPage>
  );
}
