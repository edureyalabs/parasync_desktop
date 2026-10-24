// src/renderer/src/views/agent/SecretsTab.tsx
// Names and notes only. A secret's value is never requested by this app (the database holds it encrypted and only the
// backend can open it), so there is nothing here that could be shown on screen by mistake.
import { Chip } from '@/components/ui';
import { Empty, Loaded, Panel, Row, TabPage, WebNote, shortDate } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface SecretRow { id: string; name: string; context: string | null; created_at: string; agent_importable: boolean | null; allowed_hosts: string[] | null }
interface DefRow extends SecretRow { required: boolean | null }

export function SecretsTab({ agentId }: TabProps) {
  const state = useAsync<{ secrets: SecretRow[]; defs: DefRow[] }>(async () => {
    const [secrets, defs] = await Promise.all([
      supabase.from('secrets').select('id, name, context, created_at, agent_importable, allowed_hosts').eq('agent_id', agentId).order('name', { ascending: true }),
      supabase.from('agent_user_secret_defs').select('id, name, context, required, created_at, agent_importable, allowed_hosts').eq('agent_id', agentId).order('name', { ascending: true }),
    ]);
    if (secrets.error || defs.error) throw new Error('The secrets list could not be loaded.');
    return { secrets: (secrets.data ?? []) as SecretRow[], defs: (defs.data ?? []) as DefRow[] };
  }, [agentId]);

  const flags = (r: SecretRow) => (
    <>
      {r.agent_importable ? <Chip label="Agent code can use" tone="brass" /> : <Chip label="Tools only" />}
      {(r.allowed_hosts ?? []).length > 0 && <Chip label={`${r.allowed_hosts!.length} allowed site${r.allowed_hosts!.length === 1 ? '' : 's'}`} title={r.allowed_hosts!.join(', ')} />}
    </>
  );

  return (
    <TabPage title="Secrets" subtitle="Keys and passwords the agent's tools use. Values are stored encrypted and are never shown, here or on the web.">
      <Loaded state={state}>
        {({ secrets, defs }) => (
          <>
            <Panel title="Your secrets" subtitle="Set by you, shared by everyone who uses the agent.">
              {secrets.length === 0 ? <Empty>No secrets stored.</Empty> : secrets.map((s, i) => (
                <Row key={s.id} last={i === secrets.length - 1} primary={<span style={{ fontFamily: MONO, fontSize: 13 }}>{s.name}</span>} secondary={`${s.context || 'No note'} · added ${shortDate(s.created_at)}`} right={flags(s)} />
              ))}
            </Panel>
            <Panel title="Keys each person supplies" subtitle="You name the key; every connected person adds their own value under My Keys.">
              {defs.length === 0 ? <Empty>None required.</Empty> : defs.map((d, i) => (
                <Row key={d.id} last={i === defs.length - 1} primary={<span style={{ fontFamily: MONO, fontSize: 13 }}>{d.name}</span>} secondary={d.context || 'No note'} right={<>{d.required ? <Chip label="Required" tone="red" /> : <Chip label="Optional" />}{flags(d)}</>} />
              ))}
            </Panel>
          </>
        )}
      </Loaded>
      <WebNote path={`/agents/${agentId}/secrets`}>Adding and removing secrets is done in the web app.</WebNote>
    </TabPage>
  );
}
