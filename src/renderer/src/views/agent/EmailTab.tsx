// src/renderer/src/views/agent/EmailTab.tsx
// The agent's own mailbox: where it sends from, who it may email, and what it has sent. Plain text only: message bodies are
// untrusted, so they are never rendered as HTML.
import { useCallback, useEffect, useState } from 'react';

import { Button, Chip } from '@/components/ui';
import { Empty, Fact, Loaded, Panel, Row, TabPage, WebNote, dateTime } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

const PAGE = 20;
const COLS = 'id, created_at, to_addresses, subject, body_text, status, error, from_address, attachments';

interface Settings { allow_any_recipient: boolean; allowed_recipients: string[] | null; daily_cap: number | null; reply_to_mode: string | null; suspended: boolean; suspended_reason: string | null }
interface MailRow { id: string; created_at: string; to_addresses: string[] | null; subject: string | null; body_text: string | null; status: string; error: string | null; from_address: string | null; attachments: { filename?: string }[] | null }

const TONE: Record<string, 'green' | 'brass' | 'red' | 'neutral'> = { delivered: 'green', sent: 'brass', queued: 'neutral', bounced: 'red', failed: 'red', complained: 'red', suppressed: 'red' };

export function EmailTab({ agentId, ctx }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState<MailRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const state = useAsync<{ settings: Settings | null; mails: MailRow[] }>(async () => {
    const [settings, mails] = await Promise.all([
      supabase.from('agent_email_settings').select('allow_any_recipient, allowed_recipients, daily_cap, reply_to_mode, suspended, suspended_reason').eq('agent_id', agentId).maybeSingle(),
      supabase.from('agent_emails').select(COLS).eq('agent_id', agentId).order('created_at', { ascending: false }).range(0, PAGE - 1),
    ]);
    if (mails.error) throw new Error('The sent emails could not be loaded.');
    return { settings: (settings.data as Settings | null) ?? null, mails: (mails.data ?? []) as MailRow[] };
  }, [agentId]);

  useEffect(() => { setMore([]); setHasMore((state.data?.mails.length ?? 0) === PAGE); }, [state.data]);

  const loadMore = useCallback(async () => {
    const have = (state.data?.mails.length ?? 0) + more.length;
    setLoadingMore(true);
    const { data } = await supabase.from('agent_emails').select(COLS).eq('agent_id', agentId).order('created_at', { ascending: false }).range(have, have + PAGE - 1);
    const rows = (data ?? []) as MailRow[];
    setMore((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE);
    setLoadingMore(false);
  }, [agentId, state.data, more.length]);

  const sender = ctx.agent.handle ? `${ctx.agent.handle}@mails.parasync.in` : '—';

  return (
    <TabPage title="Emails" subtitle="The agent's own address, who it may write to, and what it has sent.">
      <Loaded state={state}>
        {({ settings, mails }) => {
          const all = [...mails, ...more];
          const recipients = settings?.allowed_recipients ?? [];
          return (
            <>
              <Panel title="Sending">
                <Fact label="Sends from" value={<span style={{ fontFamily: MONO, fontSize: 12.5 }}>{sender}</span>} />
                <Fact label="Who it may email" value={settings?.allow_any_recipient ? 'Anyone' : recipients.length > 0 ? `${recipients.length} allowed address${recipients.length === 1 ? '' : 'es'}` : 'No one yet'} />
                {!settings?.allow_any_recipient && recipients.length > 0 && <Fact label="Allowed" value={<span style={{ fontFamily: MONO, fontSize: 12 }}>{recipients.join(', ')}</span>} />}
                <Fact label="Daily limit" value={settings?.daily_cap ?? 'Default'} />
                <Fact last label="Status" value={settings?.suspended ? <Chip label={settings.suspended_reason ? `Paused: ${settings.suspended_reason}` : 'Paused'} tone="red" /> : <Chip label="Active" tone="green" />} />
              </Panel>
              <Panel title="Sent" subtitle="Newest first.">
                {all.length === 0 ? <Empty>The agent has not sent any email yet.</Empty> : all.map((m, i) => {
                  const expanded = open === m.id;
                  return (
                    <div key={m.id} style={{ borderBottom: i === all.length - 1 && !hasMore ? 'none' : `1px solid ${C.line}` }}>
                      <Row
                        last onClick={() => setOpen(expanded ? null : m.id)} primary={m.subject || '(no subject)'}
                        secondary={`To ${(m.to_addresses ?? []).join(', ') || '—'} · ${dateTime(m.created_at)}${(m.attachments?.length ?? 0) > 0 ? ` · ${m.attachments!.length} attachment${m.attachments!.length === 1 ? '' : 's'}` : ''}`}
                        right={<Chip label={m.status} tone={TONE[m.status] ?? 'neutral'} />}
                      />
                      {expanded && (
                        <div style={{ padding: '0 18px 16px' }}>
                          {m.error && <div style={{ color: C.red, fontSize: 12.5, marginBottom: 8 }}>{m.error}</div>}
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, color: C.text, userSelect: 'text' }}>{m.body_text || '(no text)'}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {hasMore && <div style={{ padding: 14, display: 'flex', justifyContent: 'center' }}><Button variant="secondary" label="Load more" loading={loadingMore} onClick={() => void loadMore()} /></div>}
              </Panel>
            </>
          );
        }}
      </Loaded>
      <WebNote path={`/agents/${agentId}/email`}>Changing who the agent may email and its daily limit is done in the web app for now.</WebNote>
    </TabPage>
  );
}
