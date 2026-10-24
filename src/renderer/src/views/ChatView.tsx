// src/renderer/src/views/ChatView.tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { APP_CONFIG } from '@shared/config';

import { Icon } from '@/components/Icon';
import { DaySeparator, MessageBubble } from '@/components/MessageBubble';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import { Avatar, Center, ErrorText, Spinner } from '@/components/ui';
import { toolLabel, useAgentActivity } from '@/hooks/useAgentActivity';
import { useNotifications } from '@/hooks/useNotifications';
import { useWorkCounts, type Count } from '@/hooks/useWorkCounts';
import { useAuth } from '@/lib/auth';
import { dayKey, dayLabel } from '@/lib/chatTime';
import { useNav } from '@/lib/nav';
import { markRead } from '@/lib/readState';
import { supabase, topic } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { ChatMessage, NetworkStatus } from '@/lib/types';

const PAGE = 30;
const COLS = 'id, role, content, status, created_at, metadata';
const MAX_LENGTH = 5000;

interface AgentInfo {
  id: string;
  name: string;
  org_id: string;
  goal: string | null;
  bio: string | null;
  active: boolean;
  avatar_url: string | null;
}

// Newest-first merge keyed by id; later copies win (realtime UPDATEs carry fresher status/content).
function mergeById(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

type Row = { kind: 'msg'; id: string; message: ChatMessage; newSpeaker: boolean } | { kind: 'day'; id: string; label: string };

function CountPill({ label, count }: { label: string; count: Count }) {
  if (count.running === 0 && count.scheduled === 0) return null;
  const parts = [count.running ? `${count.running} running` : '', count.scheduled ? `${count.scheduled} scheduled` : ''].filter(Boolean).join(' · ');
  return (
    <span title={`${label}: ${parts}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.bg, background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {count.running > 0 && <span className="ps-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#7BD3B0' }} />}
      {label} {count.running + count.scheduled}
    </span>
  );
}

/** One chat with one agent. Mount it with `key={agentId}` so switching agents starts clean. */
export function ChatView({ agentId }: { agentId: string }) {
  const { session } = useAuth();
  const { openAgentTab } = useNav();
  const userId = session?.user.id;

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [netStatus, setNetStatus] = useState<NetworkStatus | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]); // newest first
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [working, setWorking] = useState(false);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showFeed, setShowFeed] = useState(false);

  const oldestRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const counts = useWorkCounts(agentId);
  const notifications = useNotifications(agentId);
  const paused = !isOwner && netStatus === 'paused';
  const inactive = agent ? !agent.active : false;
  const activity = useAgentActivity(chatId, working);

  // ── Resolve agent, role and chat ──────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data: a } = await supabase.from('agents').select('id, name, org_id, goal, bio, active, avatar_url').eq('id', agentId).maybeSingle();
      if (cancelled) return;
      if (!a) { setFatal('This agent is not available.'); setLoading(false); return; }

      const { data: org } = await supabase.from('organizations').select('owner_id').eq('id', a.org_id).maybeSingle();
      const owner = !!org && org.owner_id === userId;
      if (!owner) {
        const { data: net } = await supabase.from('agent_network').select('status').eq('agent_id', agentId).eq('user_id', userId).maybeSingle();
        if (cancelled) return;
        if (!net) { setFatal('You are not connected to this agent.'); setLoading(false); return; }
        setNetStatus(net.status as NetworkStatus);
      }

      const { data: existing } = await supabase.from('chats').select('id').eq('agent_id', agentId).eq('created_by', userId).maybeSingle();
      let cid = existing?.id as string | undefined;
      if (!cid) {
        const { data: created, error } = await supabase.from('chats').insert({ agent_id: agentId, org_id: a.org_id, created_by: userId }).select('id').single();
        if (error || !created) { if (!cancelled) { setFatal('Could not open this chat.'); setLoading(false); } return; }
        cid = created.id as string;
      }
      if (cancelled) return;
      setAgent(a as AgentInfo);
      setIsOwner(owner);
      setChatId(cid);
    })();
    return () => { cancelled = true; };
  }, [agentId, userId]);

  const fetchLatest = useCallback(async (cid: string): Promise<ChatMessage[] | null> => {
    const { data, error } = await supabase.from('messages').select(COLS).eq('chat_id', cid)
      .or('private.is.null,private.eq.false').order('created_at', { ascending: false }).limit(PAGE);
    if (error) return null;
    return (data as ChatMessage[]) ?? [];
  }, []);

  // ── Realtime + initial load (the channel is set up before the first fetch so nothing is missed) ──
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;

    const onRow = (p: { new: Record<string, unknown> }) => {
      const m = p.new as unknown as ChatMessage;
      if (cancelled || m.private) return;
      setMessages((prev) => mergeById(prev, [m]));
    };
    const channel = supabase
      .channel(topic(`chat:${chatId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, onRow)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, onRow)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` }, (p) => {
        if (!cancelled) setWorking((p.new as { orchestrator_status?: string }).orchestrator_status === 'running');
      })
      .subscribe();

    const syncStatus = async () => {
      const { data } = await supabase.from('chats').select('orchestrator_status').eq('id', chatId).maybeSingle();
      if (!cancelled) setWorking(data?.orchestrator_status === 'running');
    };
    const resync = async () => {
      const latest = await fetchLatest(chatId);
      if (!cancelled && latest) setMessages((prev) => mergeById(prev, latest));
      void syncStatus();
    };

    void (async () => {
      const latest = await fetchLatest(chatId);
      if (cancelled) return;
      if (latest === null) { setFatal('Could not load messages. Check your connection and try again.'); setLoading(false); return; }
      setMessages((prev) => mergeById(prev, latest));
      oldestRef.current = latest.length > 0 ? latest[latest.length - 1]!.created_at : null;
      setHasMore(latest.length === PAGE);
      setLoading(false);
      void syncStatus();
    })();

    // Realtime can drop while the PC sleeps or the window is hidden: resync when it comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') void resync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [chatId, fetchLatest]);

  const loadMore = useCallback(async () => {
    if (!chatId || loadingMore || !hasMore || !oldestRef.current) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    const { data } = await supabase.from('messages').select(COLS).eq('chat_id', chatId)
      .or('private.is.null,private.eq.false').lt('created_at', oldestRef.current)
      .order('created_at', { ascending: false }).limit(PAGE);
    const older = (data as ChatMessage[] | null) ?? [];
    if (older.length > 0) {
      oldestRef.current = older[older.length - 1]!.created_at;
      setMessages((prev) => mergeById(prev, older));
    } else {
      anchorRef.current = null;
    }
    setHasMore(older.length === PAGE);
    setLoadingMore(false);
  }, [chatId, loadingMore, hasMore]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !chatId || paused || inactive) return;
    setSending(true); setInput(''); setSendError(null);
    stickRef.current = true;
    const { error } = await supabase.from('messages').insert({ chat_id: chatId, role: 'user', content: text, status: 'queued' });
    if (error) {
      setInput((cur) => cur || text); // give the draft back
      setSendError('Your message could not be sent. Please try again.');
    }
    setSending(false);
    inputRef.current?.focus();
  }, [input, sending, chatId, paused, inactive]);

  // ── Derived rows (oldest first, day separators between days) ─────────────
  const rows = useMemo<Row[]>(() => {
    const visible = messages.filter((m) => m.role !== 'tool' && !(m.role === 'assistant' && m.status !== 'failed' && !m.content)).reverse();
    const out: Row[] = [];
    visible.forEach((m, i) => {
      const prev = visible[i - 1];
      if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) out.push({ kind: 'day', id: `day-${dayKey(m.created_at)}`, label: dayLabel(m.created_at) });
      out.push({ kind: 'msg', id: m.id, message: m, newSpeaker: !prev || (prev.role === 'user') !== (m.role === 'user') });
    });
    return out;
  }, [messages]);

  // Keep the view where the person expects it: pinned to the bottom for new messages, or anchored when older ones load above.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (anchorRef.current) {
      el.scrollTop = el.scrollHeight - anchorRef.current.height + anchorRef.current.top;
      anchorRef.current = null;
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows, working, loading]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    if (el.scrollTop < 140) void loadMore();
  };

  // Opening or leaving the chat clears its unread dot.
  useEffect(() => {
    markRead(agentId);
    return () => markRead(agentId);
  }, [agentId]);
  useEffect(() => { if (messages.length > 0 && document.hasFocus()) markRead(agentId); }, [agentId, messages.length]);

  // Auto-grow the composer up to a limit.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  const banner = fatal ? null
    : paused ? 'Your access to this agent is paused by its owner.'
    : inactive ? (isOwner ? 'This agent is switched off, so it won’t answer until you switch it back on in the web app.' : 'This agent has been switched off by its owner, so it can’t answer right now.')
    : null;
  const composerOff = paused || inactive || !!fatal;
  const canSend = !!input.trim() && !sending && !composerOff;
  const subtitle = activity
    ? activity.kind === 'tool' ? `using ${toolLabel(activity.label) || 'a tool'}…` : 'thinking…'
    : paused ? 'access paused' : inactive ? 'switched off' : agent?.bio || 'online';

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', background: C.chatBg }}>
      <header style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 0 20px', background: C.ink, color: C.bg }}>
        {/* The avatar and name open the agent's settings (as on the web): its profile and tabs for an owner, the profile for a connected person. */}
        <button
          onClick={() => openAgentTab('profile')} title="Open this agent's profile and settings" aria-label="Open agent profile and settings" className="ps-rail-btn"
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', padding: '6px 8px', margin: '0 -8px', borderRadius: 8 }}
        >
          {agent && (
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Avatar name={agent.name} url={agent.avatar_url} size={40} ring ringGap={C.ink} />
              {activity && <span className="ps-pulse" style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: '#7BD3B0', border: `2px solid ${C.ink}` }} />}
            </span>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.bg }}>{agent?.name ?? 'Agent'}</span>
            <span style={{ display: 'block', fontSize: 12, color: activity ? '#7BD3B0' : '#B9B4A2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CountPill label="Tasks" count={counts.tasks} />
          <CountPill label="Shifts" count={counts.shifts} />
          <CountPill label="Projects" count={counts.projects} />
        </div>
        <button
          onClick={() => void window.parasync.openExternal(`${APP_CONFIG.webUrl}/agents/${agentId}`)}
          title="Open this agent in the web app" aria-label="Open in web app" className="ps-rail-btn"
          style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: '#B9B4A2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="external" size={17} />
        </button>
        <button
          onClick={() => setShowFeed((v) => !v)} title="Notifications" aria-label="Notifications" className="ps-rail-btn"
          style={{ position: 'relative', width: 36, height: 36, borderRadius: 8, border: 'none', background: showFeed ? 'rgba(255,255,255,0.12)' : 'transparent', color: '#D8D3C2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="bell" size={18} />
          {notifications.unread > 0 && (
            <span style={{ position: 'absolute', top: 3, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: C.brass, color: '#fff', fontFamily: MONO, fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {notifications.unread > 99 ? '99+' : notifications.unread}
            </span>
          )}
        </button>
      </header>

      {fatal ? (
        <Center><div style={{ maxWidth: 360 }}><ErrorText>{fatal}</ErrorText></div></Center>
      ) : loading ? (
        <Center><Spinner size={26} /></Center>
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', paddingBottom: 10 }}>
            {loadingMore && <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Spinner size={16} color={C.faint} /></div>}
            {!hasMore && rows.length === 0 && (
              <div style={{ padding: '72px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Avatar name={agent?.name ?? 'Agent'} url={agent?.avatar_url} size={56} />
                <div style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{agent?.name} is ready.</div>
                <div style={{ fontSize: 13, color: C.soft, lineHeight: 1.6, maxWidth: 360 }}>{agent?.goal ?? 'Say hello to get going.'}</div>
              </div>
            )}
            {rows.map((r) => (r.kind === 'day' ? <DaySeparator key={r.id} label={r.label} /> : <div key={r.id} className="ps-rise"><MessageBubble message={r.message} newSpeaker={r.newSpeaker} /></div>))}
            {working && (
              <div style={{ padding: '10px 28px 0', display: 'flex' }}>
                <span style={{ display: 'inline-flex', gap: 4, background: '#fff', borderRadius: 10, padding: '10px 13px', boxShadow: '0 1px 1px rgba(0,0,0,0.07)' }} aria-label="Agent is working">
                  {[0, 1, 2].map((i) => <span key={i} className="ps-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: C.soft, animationDelay: `${i * 0.2}s` }} />)}
                </span>
              </div>
            )}
          </div>

          {banner && <div style={{ margin: '0 20px 8px', background: C.redBg, border: `1px solid ${C.redLine}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#8A3529', lineHeight: 1.5 }}>{banner}</div>}
          {sendError && <div style={{ margin: '0 20px 8px', background: C.ink, color: C.bg, borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>{sendError}</div>}

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '8px 20px 16px' }}>
            <textarea
              ref={inputRef} value={input} rows={1} disabled={composerOff} maxLength={MAX_LENGTH} aria-label="Message"
              placeholder={paused ? 'Access paused' : composerOff ? 'Chat unavailable' : 'Type a message'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              style={{ flex: 1, resize: 'none', minHeight: 46, maxHeight: 168, border: `1.5px solid ${C.line}`, borderRadius: 23, padding: '12px 18px', fontSize: 14, lineHeight: '21px', color: '#1A190F', background: '#fff', outline: 'none', boxShadow: '0 1px 3px rgba(38,37,30,0.08)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.brass; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.line; }}
            />
            <button
              onClick={() => void send()} disabled={!canSend} aria-label="Send message" title="Send (Enter)" className="ps-press"
              style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: canSend ? C.ink : '#D8D3C2', color: canSend ? '#fff' : '#6F6C5E', cursor: canSend ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: canSend ? '0 2px 6px rgba(38,37,30,0.25)' : 'none' }}
            >
              {sending ? <Spinner size={18} color="#fff" /> : <Icon name="send" size={20} strokeWidth={1.8} />}
            </button>
          </div>
        </>
      )}

      {showFeed && <NotificationsPanel agentName={agent?.name ?? 'this agent'} state={notifications} onClose={() => setShowFeed(false)} />}
    </div>
  );
}
