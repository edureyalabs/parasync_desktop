// src/renderer/src/views/agent/WhatsAppTab.tsx
import { Chip } from '@/components/ui';
import { Fact, Loaded, Panel, TabPage, WebNote, dateTime } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import type { TabProps } from '@/views/agent/types';

interface Conn { status: string; phone_number: string | null; push_name: string | null; last_connected_at: string | null; last_error: string | null; stop_reason: string | null; messages_stored: number | null }

const STATUS: Record<string, { text: string; tone: 'green' | 'brass' | 'red' | 'neutral' | 'blue' }> = {
  connected: { text: 'Connected', tone: 'green' }, connecting: { text: 'Connecting', tone: 'blue' }, qr: { text: 'Waiting for a scan', tone: 'brass' },
  disconnected: { text: 'Disconnected', tone: 'neutral' }, logged_out: { text: 'Logged out', tone: 'red' }, error: { text: 'Needs attention', tone: 'red' },
};

export function WhatsAppTab({ agentId }: TabProps) {
  const state = useAsync<{ conn: Conn | null; readChats: number; sendChats: number }>(async () => {
    const head = (access: string[]) => supabase.from('wa_chats').select('id', { count: 'exact', head: true }).eq('agent_id', agentId).eq('active', true).in('access', access);
    const [conn, read, send] = await Promise.all([
      supabase.from('wa_connection_status').select('status, phone_number, push_name, last_connected_at, last_error, stop_reason, messages_stored').eq('agent_id', agentId).maybeSingle(),
      head(['read', 'both']), head(['send', 'both']),
    ]);
    return { conn: (conn.data as Conn | null) ?? null, readChats: read.count ?? 0, sendChats: send.count ?? 0 };
  }, [agentId]);

  return (
    <TabPage title="WhatsApp" subtitle="One linked WhatsApp number for this agent (beta). It reads text messages while the number is connected, and replies with text or files only in chats you have opened for it.">
      <Loaded state={state}>
        {({ conn, readChats, sendChats }) => {
          const s = conn ? (STATUS[conn.status] ?? { text: conn.status, tone: 'neutral' as const }) : null;
          return (
            <>
              <Panel title="Connection">
                <Fact label="Status" value={s ? <Chip label={s.text} tone={s.tone} /> : <Chip label="No number linked" />} />
                {conn?.phone_number && <Fact label="Number" value={`+${conn.phone_number}`} />}
                {conn?.push_name && <Fact label="Profile name" value={conn.push_name} />}
                {conn?.last_connected_at && <Fact label="Last connected" value={dateTime(conn.last_connected_at)} />}
                {conn?.last_error && <Fact label="Last problem" value={conn.last_error} />}
                <Fact last label="Messages kept (30 days)" value={conn?.messages_stored ?? 0} />
              </Panel>
              <Panel title="Chats opened for the agent">
                <Fact label="It may read" value={`${readChats} chat${readChats === 1 ? '' : 's'}`} />
                <Fact last label="It may write to" value={`${sendChats} chat${sendChats === 1 ? '' : 's'}`} />
              </Panel>
            </>
          );
        }}
      </Loaded>
      <WebNote path={`/agents/${agentId}/whatsapp`}>Linking a number (QR code), choosing chats and the daily limit are done in the web app for now.</WebNote>
    </TabPage>
  );
}
