// app/(shell)/agents/[id]/whatsapp/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { AgentPage } from '@/components/agent-ui/AgentPage';
import { Btn, Card, Chip, EmptyState, PageLoading } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { ChatList } from '@/components/whatsapp/ChatList';
import { ConfigModal } from '@/components/whatsapp/ConfigModal';
import { ConnectionPanel } from '@/components/whatsapp/ConnectionPanel';
import { Thread } from '@/components/whatsapp/Thread';
import {
  attentionOf, BETA_NOTE, formatPhone, gatewayQuiet, isTransient, MAX_SEND_CAP, MIN_SEND_CAP, STATUS_LABEL, STATUS_TONE, WA_TOOL_KEYS,
  type WaAccess, type WaChat, type WaConnection, type WaEvent, type WaSent,
} from '@/lib/whatsapp';

// The WhatsApp tab (owner only; it exists while a WhatsApp platform tool is on, or while a number is still linked), laid out like WhatsApp Web: the connection and its status on top,
// the chats the agent may use on the left, and for the chosen chat what the agent sent and when on the right. Choosing which chats are open and every other setting is in the
// Config dialog, so the conversation gets the screen. The link itself is held by the separate WhatsApp gateway service (repo parasync_wa, see its wa.md), which also reconnects it
// by itself; the page only reads state from Supabase under RLS (the link's state through the wa_connection_status view, which leaves the credentials out) and saves chat access,
// notes and the send limit the same way. Only what must reach the gateway (connect, disconnect, unlink, refresh groups, add a contact) goes through /api/agents/[id]/whatsapp/*.

const POLL_FAST_MS = 2_500;
const POLL_SLOW_MS = 20_000;
const REFRESH_MS = 30_000;
const QR_STALE_MS = 45_000;
const SENT_LIMIT = 500;
const EVENT_LIMIT = 25;

interface StatusPayload {
  enabled: boolean;
  connection: (WaConnection & { messages_stored: number; latest_message_at: string | null }) | null;
  skew: number;                    // server clock minus this browser's clock, so "how long ago" is right on a wrong clock
}

const WA_CSS = `
  .wa-body { flex: 1; min-height: 0; display: flex; }
  .wa-list { width: 360px; max-width: 42%; flex-shrink: 0; border-right: 1px solid ${C.line}; display: flex; flex-direction: column; min-height: 0; background: ${C.card}; }
  .wa-read { flex: 1; min-width: 0; min-height: 0; background: ${C.card}; }
  .wa-row { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 0.7rem; width: 100%; text-align: left; border: none; border-bottom: 1px solid ${C.lineSoft}; border-left: 3px solid transparent; background: transparent; padding: 0.65rem 0.85rem 0.65rem 0.7rem; cursor: pointer; font: inherit; }
  .wa-row:hover { background: ${C.paper}; }
  .wa-row[aria-current="true"] { background: ${C.brassTint}; border-left-color: ${C.brass}; }
  .wa-row:focus-visible { outline: 2px solid ${C.brass}; outline-offset: -2px; }
  .wa-back { display: none; }
  @media (max-width: 760px) {
    .wa-list { width: 100%; max-width: none; border-right: none; }
    .wa-root[data-view="read"] .wa-list { display: none; }
    .wa-root[data-view="list"] .wa-read { display: none; }
    .wa-back { display: block; }
    .wa-number { display: none; }
  }
`;

async function readJson(res: Response): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    return await res.json();
  } catch {
    return { ok: false, error: 'Unexpected reply from the server.' };
  }
}

async function loadStatus(agentId: string): Promise<StatusPayload | { error: string }> {
  const supabase = createClient();
  const [tool, conn] = await Promise.all([
    supabase.from('agent_platform_tools').select('enabled').eq('agent_id', agentId).in('tool_key', WA_TOOL_KEYS).eq('enabled', true).limit(1),
    supabase.from('wa_connection_status').select('*').eq('agent_id', agentId).maybeSingle(),
  ]);
  if (conn.error || tool.error) return { error: `Could not load the WhatsApp status: ${(conn.error ?? tool.error)!.message}.` };
  const row = conn.data as (WaConnection & { messages_stored: number; latest_message_at: string | null; server_now: string }) | null;
  return { enabled: (tool.data?.length ?? 0) > 0, connection: row, skew: row?.server_now ? new Date(row.server_now).getTime() - Date.now() : 0 };
}

async function loadSent(agentId: string): Promise<{ rows: WaSent[]; truncated: boolean } | null> {
  const { data, error } = await createClient().from('wa_outbox')
    .select('id, chat_jid, text, attachment_name, status, error, created_at, sent_at').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(SENT_LIMIT + 1);
  if (error) return null;
  const all = (data ?? []) as WaSent[];
  return { rows: all.slice(0, SENT_LIMIT), truncated: all.length > SENT_LIMIT };
}

async function loadEvents(agentId: string): Promise<WaEvent[] | null> {
  const { data, error } = await createClient().from('wa_connection_events')
    .select('id, at, event, status, code, detail').eq('agent_id', agentId).order('at', { ascending: false }).limit(EVENT_LIMIT);
  return error ? null : ((data ?? []) as WaEvent[]);
}

const CHAT_COLUMNS = 'id, jid, kind, name, participants_count, access, context, source, active, last_message_at';

async function loadChats(agentId: string): Promise<WaChat[] | null> {
  const { data, error } = await createClient().from('wa_chats').select(CHAT_COLUMNS).eq('agent_id', agentId).order('name', { ascending: true }).limit(3000);
  return error ? null : ((data ?? []) as WaChat[]);
}

export default function WhatsAppPage() {
  const { agentId, role } = useAgentCtx();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState('');
  const [chats, setChats] = useState<WaChat[]>([]);
  const [sendCap, setSendCap] = useState(50);
  const [sent, setSent] = useState<{ rows: WaSent[]; truncated: boolean }>({ rows: [], truncated: false });
  const [events, setEvents] = useState<WaEvent[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [connOpen, setConnOpen] = useState<boolean | null>(null);     // null = follow the state: open while not connected, collapsed once connected
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const intervalRef = useRef(POLL_SLOW_MS);

  const applyStatus = useCallback((s: StatusPayload | { error: string }) => {
    if ('error' in s) { setStatusError(s.error); return; }
    setStatusError('');
    setStatus(s);
    intervalRef.current = isTransient(s.connection?.status) ? POLL_FAST_MS : POLL_SLOW_MS;
  }, []);

  const refreshChats = useCallback(async () => {
    const list = await loadChats(agentId);
    if (list) setChats(list);
  }, [agentId]);

  const refreshSent = useCallback(async () => {
    const list = await loadSent(agentId);
    if (list) setSent(list);
  }, [agentId]);

  const refreshEvents = useCallback(async () => {
    const list = await loadEvents(agentId);
    if (list) setEvents(list);
  }, [agentId]);

  // First load.
  useEffect(() => {
    if (!agentId || role !== 'owner') return;
    (async () => {
      const [s, list, settings, outbox, history] = await Promise.all([
        loadStatus(agentId),
        loadChats(agentId),
        createClient().from('wa_settings').select('daily_send_cap').eq('agent_id', agentId).maybeSingle(),
        loadSent(agentId),
        loadEvents(agentId),
      ]);
      applyStatus(s);
      if (list) setChats(list);
      if (outbox) setSent(outbox);
      if (history) setEvents(history);
      if (settings.data?.daily_send_cap) setSendCap(settings.data.daily_send_cap as number);
      setLoading(false);
    })();
  }, [agentId, role, applyStatus]);

  // Keep the status fresh: fast while a link is being made, slow otherwise, and paused while the tab is hidden.
  useEffect(() => {
    if (!agentId || role !== 'owner') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (document.visibilityState === 'visible') {
        const s = await loadStatus(agentId);
        if (!cancelled) { applyStatus(s); setNow(Date.now()); }
      }
      if (!cancelled) timer = setTimeout(loop, intervalRef.current);
    };
    timer = setTimeout(loop, intervalRef.current);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [agentId, role, applyStatus]);

  const conn = status?.connection ?? null;
  const st = conn?.status ?? 'idle';
  const linked = !!conn?.phone_number;                       // a number is (or was, until it is unlinked) attached: only then is there anything to configure
  const connected = st === 'connected';

  // The history changes whenever the link does; the chats and sent list change on their own while connected.
  useEffect(() => {
    if (!agentId || role !== 'owner') return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refreshEvents();
      if (connected) { void refreshChats(); void refreshSent(); }
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [agentId, role, connected, refreshChats, refreshSent, refreshEvents]);

  // Once a number links, the group list arrives a few seconds later: pull it in as soon as the status turns connected.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (connected && !wasConnected.current) { setTimeout(() => { void refreshChats(); }, 6_000); void refreshChats(); void refreshEvents(); }
    wasConnected.current = connected;
  }, [connected, refreshChats, refreshEvents]);

  const skewNow = now + (status?.skew ?? 0);
  const quiet = gatewayQuiet(conn, skewNow);
  const acknowledged = !!conn?.acknowledged_at;
  const canLink = acknowledged || accepted;
  const attention = attentionOf(conn, skewNow);

  // The chats the owner opened, newest agent activity first; and the newest thing the agent sent to each.
  const sentByChat = useMemo(() => {
    const map = new Map<string, WaSent[]>();
    for (const m of sent.rows) map.set(m.chat_jid, [...(map.get(m.chat_jid) ?? []), m]);
    return map;
  }, [sent.rows]);
  const lastSent = useMemo(() => {
    const map = new Map<string, WaSent>();
    for (const [jid, rows] of sentByChat) if (rows[0]) map.set(jid, rows[0]);
    return map;
  }, [sentByChat]);
  const openChats = useMemo(() => {
    const stamp = (c: WaChat) => new Date(lastSent.get(c.jid)?.created_at ?? c.last_message_at ?? 0).getTime();
    return chats.filter(c => c.access !== 'none').sort((a, b) => stamp(b) - stamp(a) || (a.name ?? '').localeCompare(b.name ?? ''));
  }, [chats, lastSent]);
  // On a wide screen show a conversation straight away instead of an empty pane; on a phone the list comes first.
  const [wide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 761px)').matches);
  const selected = openChats.find(c => c.jid === selectedJid) ?? (wide && selectedJid === null ? openChats[0] ?? null : null);

  const call = async (key: string, url: string, init: RequestInit, success?: string): Promise<boolean> => {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch(url, init);
      const data = await readJson(res);
      if (!res.ok || !data.ok) {
        setNotice({ ok: false, text: data.error || 'That did not work. Try again.' });
        return false;
      }
      if (success) setNotice({ ok: true, text: success });
      applyStatus(await loadStatus(agentId));
      void refreshEvents();
      return true;
    } catch {
      setNotice({ ok: false, text: 'Could not reach the server. Check your connection and try again.' });
      return false;
    } finally {
      setBusy('');
    }
  };

  const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const connect = () => call('connect', `/api/agents/${agentId}/whatsapp/connect`, post({ mode: 'qr', acknowledged: canLink }));

  const stop = () => call('stop', `/api/agents/${agentId}/whatsapp/disconnect`, post({ action: 'stop' }), 'Disconnected. The number stays linked; connect again any time.');

  const unlink = async () => {
    const ok = await call('unlink', `/api/agents/${agentId}/whatsapp/disconnect`, post({ action: 'logout' }), 'Unlinked. Everything stored for that number has been deleted.');
    if (ok) { setConfirmUnlink(false); setChats([]); setSent({ rows: [], truncated: false }); setSelectedJid(null); setConnOpen(null); }
  };

  const syncGroups = async () => {
    if (await call('groups', `/api/agents/${agentId}/whatsapp/groups`, post({}), 'Group list refreshed.')) setTimeout(() => { void refreshChats(); }, 1200);
  };

  const addContact = async (phone: string, name: string): Promise<boolean> => {
    const ok = await call('contact', `/api/agents/${agentId}/whatsapp/contacts`, post({ phone, name }), 'Contact added.');
    if (ok) await refreshChats();
    return ok;
  };

  const removeContact = async (chat: WaChat) => {
    if (await call('contact', `/api/agents/${agentId}/whatsapp/contacts?jid=${encodeURIComponent(chat.jid)}`, { method: 'DELETE' }, 'Contact removed, with anything stored for it.')) await refreshChats();
  };

  const setAccess = async (chat: WaChat, access: WaAccess) => {
    const before = chat.access;
    setChats(list => list.map(c => (c.id === chat.id ? { ...c, access } : c)));
    const { error } = await createClient().from('wa_chats').update({ access }).eq('id', chat.id);
    if (error) {
      setChats(list => list.map(c => (c.id === chat.id ? { ...c, access: before } : c)));
      setNotice({ ok: false, text: 'Could not change access for that chat. Try again.' });
    }
  };

  const saveContext = async (chat: WaChat, text: string): Promise<boolean> => {
    const value = text === '' ? null : text;
    const { error } = await createClient().from('wa_chats').update({ context: value }).eq('id', chat.id);
    if (error) return false;
    setChats(list => list.map(c => (c.id === chat.id ? { ...c, context: value } : c)));
    return true;
  };

  const saveSendCap = async (raw: number) => {
    const value = Math.round(raw);
    if (!Number.isFinite(value) || value < MIN_SEND_CAP || value > MAX_SEND_CAP) { setNotice({ ok: false, text: `The daily sending limit must be between ${MIN_SEND_CAP} and ${MAX_SEND_CAP}.` }); return; }
    const previous = sendCap;
    setSendCap(value);
    const { error } = await createClient().from('wa_settings').upsert({ agent_id: agentId, daily_send_cap: value }, { onConflict: 'agent_id' });
    if (error) { setSendCap(previous); setNotice({ ok: false, text: 'Could not save the limit. Try again.' }); }
  };

  if (loading) return <PageLoading />;

  if (role !== 'owner') {
    return (
      <AgentPage eyebrow="WhatsApp" title="WhatsApp">
        <Card><EmptyState icon="💬" title="Only the owner can see this">The WhatsApp link and its chats are managed by the agent&rsquo;s owner.</EmptyState></Card>
      </AgentPage>
    );
  }

  const enabled = status?.enabled === true;
  if (status && !enabled && !linked) {
    return (
      <AgentPage eyebrow="WhatsApp" title="WhatsApp">
        <Card>
          <EmptyState icon="💬" title="WhatsApp is off for this agent" action={<Link href={`/agents/${agentId}/platform-tools`} style={{ textDecoration: 'none' }}><Btn variant="primary">Open Platform Tools</Btn></Link>}>
            Turn on the WhatsApp card in Platform Tools to let this agent read and send WhatsApp messages. Linking a number and choosing chats happens here.
          </EmptyState>
        </Card>
      </AgentPage>
    );
  }

  const connPanelOpen = connOpen ?? !connected;
  const qrFresh = conn?.qr_updated_at ? skewNow - new Date(conn.qr_updated_at).getTime() < QR_STALE_MS : false;
  const linking = st === 'awaiting_scan' || st === 'connecting';
  const number = formatPhone(conn?.phone_number);
  const statusLabel = quiet && st !== 'idle' ? 'Service not responding' : STATUS_LABEL[st];
  const statusTone = quiet && st !== 'idle' ? 'amber' : STATUS_TONE[st];

  return (
    <div
      className="wa-root" data-view={selected ? 'read' : 'list'}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.card, fontFamily: "'Inter', 'Helvetica Neue', sans-serif", color: C.ink }}
    >
      <style>{WA_CSS}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.6rem 1rem', borderBottom: `1px solid ${C.line}`, background: C.card, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, color: '#514726', margin: 0, whiteSpace: 'nowrap' }}>WhatsApp</h1>
          <Chip tone="brass" title="WhatsApp support is in beta">Beta</Chip>
          <Chip tone={statusTone} dot>{statusLabel}</Chip>
          {number && <span className="wa-number" style={{ fontFamily: MONO, fontSize: '0.76rem', color: C.soft }}>{number}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
          <Btn size="sm" onClick={() => setConnOpen(!connPanelOpen)} aria-expanded={connPanelOpen}>{connPanelOpen ? 'Hide connection' : 'Connection'}</Btn>
          {linked && <Btn size="sm" variant="primary" onClick={() => setConfigOpen(true)}>⚙ Config</Btn>}
        </div>
      </div>

      <div style={{ padding: '0.45rem 1rem', background: C.brassTint, borderBottom: `1px solid ${C.brassLine}`, fontSize: '0.72rem', color: C.brassDeep, lineHeight: 1.55 }}>
        <strong style={{ fontWeight: 600 }}>Beta.</strong> {BETA_NOTE}
      </div>

      {statusError && <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: C.red, borderBottom: `1px solid ${C.lineSoft}` }}>{statusError} It will retry automatically.</div>}
      {notice && !configOpen && (
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: notice.ok ? C.green : C.red, background: notice.ok ? C.greenWash : C.redWash, borderBottom: `1px solid ${notice.ok ? C.greenLine : C.redLine}` }}>{notice.text}</div>
      )}
      {!enabled && linked && (
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: C.amber, background: C.amberWash, borderBottom: `1px solid ${C.amberLine}`, lineHeight: 1.55 }}>
          WhatsApp is switched off for this agent, so nothing is read or sent and the number is paused (still linked). Turn it back on in <Link href={`/agents/${agentId}/platform-tools`} style={{ color: C.amber }}>Platform Tools</Link> and it reconnects by itself, or unlink the number from the Connection panel.
        </div>
      )}
      {attention && (
        <div
          role="alert"
          style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', padding: '0.6rem 1rem', background: attention.tone === 'red' ? C.redWash : C.amberWash, borderBottom: `1px solid ${attention.tone === 'red' ? C.redLine : C.amberLine}` }}
        >
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: '0.8rem', color: attention.tone === 'red' ? C.red : C.amber }}>{attention.title}</strong>
            <span style={{ fontSize: '0.76rem', color: C.body, lineHeight: 1.55 }}>{attention.text}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem' }}>
            {attention.action && <Btn size="sm" variant="primary" onClick={connect} disabled={!!busy || !canLink}>{busy === 'connect' ? 'Starting…' : attention.action === 'relink' ? 'Link again' : 'Connect now'}</Btn>}
            <Btn size="sm" variant="ghost" onClick={() => setConfigOpen(true)}>See history</Btn>
          </div>
        </div>
      )}

      {connPanelOpen && (
        <div style={{ borderBottom: `1px solid ${C.line}`, background: C.card }}>
          <ConnectionPanel
            conn={conn} status={st} connected={connected} linking={linking} quiet={quiet} qrFresh={qrFresh} acknowledged={acknowledged} accepted={accepted} canLink={canLink}
            busy={busy} confirmUnlink={confirmUnlink} onAccept={setAccepted} onConnect={connect} onStop={stop} onAskUnlink={setConfirmUnlink} onUnlink={unlink}
          />
        </div>
      )}

      {linked ? (
        <div className="wa-body">
          <ChatList
            chats={openChats} lastSent={lastSent} selectedJid={selected?.jid ?? null} search={search} onSearch={setSearch}
            onSelect={jid => { setSelectedJid(jid); void refreshSent(); }} onOpenConfig={() => setConfigOpen(true)} connected={connected} hasAnyChat={chats.length > 0}
          />
          {selected ? (
            <Thread chat={selected} rows={sentByChat.get(selected.jid) ?? []} truncated={sent.truncated} onBack={() => setSelectedJid(null)} />
          ) : (
            <article className="wa-read" aria-label="Conversation" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', color: C.muted, background: C.paper }}>
              <div>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.55 }}>💬</span>
                <p style={{ fontSize: '0.86rem', margin: 0 }}>{openChats.length === 0 ? 'Open a chat in Config to see what the agent sends there' : 'Select a chat to see what the agent sent'}</p>
              </div>
            </article>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <EmptyState icon="💬" title="No number linked">Link a WhatsApp number in Connection above. The chats you open for the agent, and what it sends to them, appear here.</EmptyState>
        </div>
      )}

      {configOpen && (
        <ConfigModal
          chats={chats} connected={connected} busy={busy} sendCap={sendCap} events={events} notice={notice} onClose={() => setConfigOpen(false)}
          onAccess={setAccess} onContext={saveContext} onRemoveContact={removeContact} onSyncGroups={syncGroups} onAddContact={addContact} onSaveSendCap={saveSendCap}
        />
      )}
    </div>
  );
}
