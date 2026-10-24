// src/renderer/src/views/agent/MyKeysTab.tsx
// For a connected person: the keys this agent needs from them, and which they have already supplied. Values are never read.
import { Chip } from '@/components/ui';
import { Empty, Loaded, Panel, Row, TabPage, WebNote } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface Def { id: string; name: string; context: string | null; required: boolean | null }

export function MyKeysTab({ agentId }: TabProps) {
  const state = useAsync<{ defs: Def[]; mine: Set<string> }>(async () => {
    const [defs, mine] = await Promise.all([
      supabase.from('agent_user_secret_defs').select('id, name, context, required').eq('agent_id', agentId).order('name', { ascending: true }),
      supabase.from('agent_user_secrets').select('name').eq('agent_id', agentId),
    ]);
    if (defs.error) throw new Error('Your keys could not be loaded.');
    return { defs: (defs.data ?? []) as Def[], mine: new Set(((mine.data ?? []) as { name: string }[]).map((m) => m.name)) };
  }, [agentId]);

  return (
    <TabPage title="My Keys" subtitle="Keys this agent needs from you, such as your own account key for a service. Only you and the agent's tools can use them.">
      <Loaded state={state}>
        {({ defs, mine }) => (
          <Panel>
            {defs.length === 0 ? <Empty>This agent does not need any keys from you.</Empty> : defs.map((d, i) => (
              <Row
                key={d.id} last={i === defs.length - 1} primary={<span style={{ fontFamily: MONO, fontSize: 13 }}>{d.name}</span>} secondary={d.context || undefined}
                right={<>{d.required && !mine.has(d.name) && <Chip label="Required" tone="red" />}<Chip label={mine.has(d.name) ? 'You have added it' : 'Not added yet'} tone={mine.has(d.name) ? 'green' : 'neutral'} /></>}
              />
            ))}
          </Panel>
        )}
      </Loaded>
      <WebNote path={`/agents/${agentId}/keys`}>Adding or changing your keys is done in the web app for now.</WebNote>
    </TabPage>
  );
}
