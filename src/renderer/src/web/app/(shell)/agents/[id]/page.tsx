// app/agents/[id]/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAgentCtx } from './layout';
import { createClient } from '@/lib/supabase/client';
import { AttachmentChips, type MessageAttachment } from '@/components/Attachments';

// ─── Types ────────────────────────────────────────────────────────────────────

// What a message from background work is, shown as a small tag beside the agent's name: a project's messages, a
// follow-up's update, or the result of a task delivered to this chat.
const PROJECT_MESSAGE_LABEL: Record<string, string> = {
  report: 'Project report', update: 'Project update', question: 'Project question',
  failed: 'Project stopped', expired: 'Project ended', cancelled: 'Project cancelled',
};
const FOLLOWUP_MESSAGE_LABEL: Record<string, string> = {
  report: 'Follow-up update', update: 'Follow-up update',
  failed: 'Follow-up stopped', expired: 'Follow-up ended', cancelled: 'Follow-up cancelled',
};

function messageBadge(msg: { role: string; metadata: { source?: string; kind?: string } | null }): { label: string; kind: 'project' | 'followup' | 'task' } | null {
  const source = msg.metadata?.source;
  if (source === 'project') return { label: PROJECT_MESSAGE_LABEL[msg.metadata?.kind ?? ''] ?? 'Project update', kind: 'project' };
  if (source === 'followup') return { label: FOLLOWUP_MESSAGE_LABEL[msg.metadata?.kind ?? ''] ?? 'Follow-up update', kind: 'followup' };
  if (msg.role === 'task') return { label: 'Task update', kind: 'task' };
  return null;
}

const BADGE_STYLE: Record<'project' | 'followup' | 'task', { color: string; background: string; border: string }> = {
  project:  { color: '#5B4B8A', background: '#EAE5F4', border: '#CDC3E3' },
  followup: { color: '#2F6B78', background: '#E3F0F2', border: '#BBD9DE' },
  task:     { color: '#7C5F27', background: '#EFE4C9', border: '#E4D2A0' },
};

interface Message {
  id:         string;
  role:       'user' | 'assistant' | 'tool' | 'task';
  content:    string;
  status:     'queued' | 'processing' | 'completed' | 'failed';
  created_at: string;
  metadata:   { attachments?: MessageAttachment[]; source?: string; kind?: string } | null;
  private?:   boolean | null;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 14, color = '#9E9C8F' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#E2DFD3'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Delivery ticks ───────────────────────────────────────────────────────────
// queued = sent (single tick) · processing = agent has picked it up (double
// tick, gray) · completed = agent has answered (double tick, blue) · failed =
// error mark. Mirrors the send/delivered/read pattern users already know.

function Ticks({ status }: { status: Message['status'] }) {
  if (status === 'failed') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6.5" stroke="#B34A3C" strokeWidth="1.3" />
        <path d="M8 5v3.6" stroke="#B34A3C" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="11" r="0.7" fill="#B34A3C" />
      </svg>
    );
  }
  const double = status === 'processing' || status === 'completed';
  const color  = status === 'completed' ? '#3B82C4' : '#8E8B7B';
  return (
    <svg width={double ? 16 : 12} height="11" viewBox={`0 0 ${double ? 16 : 12} 11`} fill="none" style={{ flexShrink: 0 }}>
      <path d="M1 5.6L4 8.6L10.5 1.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {double && <path d="M5.5 5.6L8.5 8.6L15 1.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// ─── Workspace page ───────────────────────────────────────────────────────────

// A markdown table renders at its content's natural width, which can exceed
// the chat bubble — wrapping it in its own overflow-x:auto scroll region
// keeps a wide table scrollable in place instead of widening the whole
// message list (and, with it, the entire chat pane's own scrollbar).
const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="md-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

const MAX_ATTACHMENTS = 2;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

interface PendingAttachment extends MessageAttachment {
  uploading?: boolean;
}

type AccessBlockReason = 'subscription_inactive' | 'credits_exhausted' | 'agent_inactive';
type SendNoticeReason = AccessBlockReason | 'send_failed';

export default function WorkspacePage() {
  const { chatId, agent, agentId, role, networkStatus } = useAgentCtx();
  const paused = role === 'member' && networkStatus === 'paused';

  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset,      setOffset]      = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachError,  setAttachError] = useState<string | null>(null);
  // Subscription/credit gate (see app/api/agents/[id]/access-status) — a
  // read-only status check backing this banner and the send-blocking notice
  // below. The real enforcement is entirely server-side (bemain); this is
  // purely so the user finds out BEFORE sending instead of only after.
  const [accessBlocked, setAccessBlocked] = useState<AccessBlockReason | null>(null);
  const [sendNotice,    setSendNotice]    = useState<string | null>(null);
  const sendNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE = 20;

  const bottomRef    = useRef<HTMLDivElement>(null);
  const topRef       = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load history + subscribe to realtime ──────────────────────────────────

  useEffect(() => {
    if (!chatId) return;

    const supabase = createClient();
    let cancelled = false;

    // Set up channel SYNCHRONOUSLY before any async work
    // This prevents StrictMode double-invoke from calling .on() after .subscribe()
    const channel = supabase
      .channel(`workspace:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          if (cancelled) return;
          const msg = payload.new as Message;
          // A Runsheet (cron) firing inserts its own trigger message marked
          // `private: true` — the same pipeline a live chat message goes
          // through, but the trigger text itself was never typed by this
          // user and shouldn't render as if it were. Only the agent's own
          // (non-private) reply is ever shown — see the loadHistory/loadMore
          // queries below for the same filter applied to history.
          if (msg.private) return;
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          if (cancelled) return;
          const msg = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
        }
      )
      .subscribe();

    // Load last 20 messages on mount
    const loadHistory = async () => {
      setLoading(true);

      // Get total count first to know if there are older messages
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('chat_id', chatId)
        .or('private.is.null,private.eq.false');

      const total = count ?? 0;
      const startOffset = Math.max(0, total - PAGE);

      const { data } = await supabase
        .from('messages')
        .select('id, role, content, status, created_at, metadata')
        .eq('chat_id', chatId)
        .or('private.is.null,private.eq.false')
        .order('created_at', { ascending: true })
        .range(startOffset, total - 1);

      if (!cancelled) {
        setMessages((data as Message[]) ?? []);
        setOffset(startOffset);
        setHasMore(startOffset > 0);
        setLoading(false);
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  // ── Subscription/credit access status ─────────────────────────────────────

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/access-status`);
        const data = await res.json();
        if (!cancelled && res.ok && data.ok) setAccessBlocked(data.blocked ? data.reason : null);
      } catch {
        // Purely informational — if this fails, the composer just behaves as
        // before (no banner); the actual send would still be safely blocked
        // server-side if the agent really is gated.
      }
    })();

    return () => { cancelled = true; };
  }, [agentId]);

  useEffect(() => () => { if (sendNoticeTimer.current) clearTimeout(sendNoticeTimer.current); }, []);

  // ── Auto-scroll to bottom on new messages ────────────────────────────────
  // Keyed on the *last* message's id + content + status, not just id or array
  // length — loadMore() prepends older history to the front (changing length,
  // not the last message), while a genuinely new message changes the id, and
  // the assistant's placeholder row filling in with its real answer (a
  // realtime UPDATE, same id, empty → non-empty content) needs to trigger a
  // scroll too, which id alone wouldn't catch.

  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastMessageKey = last ? `${last.id}:${last.content.length}:${last.status}` : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMessageKey]);

  // Scroll to bottom when first load completes
  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [loading]);

  // ── Load more on scroll to top ────────────────────────────────────────────

  const loadMore = async () => {
    if (!chatId || loadingMore || !hasMore) return;
    setLoadingMore(true);

    const supabase = createClient();
    const newOffset = Math.max(0, offset - PAGE);
    const newEnd    = offset - 1;

    const { data } = await supabase
      .from('messages')
      .select('id, role, content, status, created_at')
      .eq('chat_id', chatId)
      .or('private.is.null,private.eq.false')
      .order('created_at', { ascending: true })
      .range(newOffset, newEnd);

    if (data && data.length > 0) {
      // Save scroll position before prepending
      const scrollEl = scrollRef.current;
      const prevScrollHeight = scrollEl?.scrollHeight ?? 0;

      setMessages(prev => [...(data as Message[]), ...prev]);
      setOffset(newOffset);
      setHasMore(newOffset > 0);

      // Restore scroll position so user stays at same message
      requestAnimationFrame(() => {
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
        }
      });
    }

    setLoadingMore(false);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 80) loadMore();
  };

  // ── Attachments ───────────────────────────────────────────────────────────

  const handleAttachClick = () => {
    if (paused || pendingAttachments.length >= MAX_ATTACHMENTS) return;
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setAttachError(null);
    const room = MAX_ATTACHMENTS - pendingAttachments.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const toUpload = files.slice(0, room);
    if (files.length > toUpload.length) {
      setAttachError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    }

    for (const file of toUpload) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachError(`"${file.name}" is over the 20MB limit.`);
        continue;
      }

      const placeholderPath = `__uploading__:${file.name}:${Date.now()}`;
      setPendingAttachments(prev => [...prev, {
        path: placeholderPath, filename: file.name,
        mime_type: file.type || 'application/octet-stream', size_bytes: file.size,
        uploading: true,
      }]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/agents/${agentId}/workspace/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setAttachError(data.error || `Could not upload "${file.name}".`);
          setPendingAttachments(prev => prev.filter(a => a.path !== placeholderPath));
          continue;
        }
        setPendingAttachments(prev => prev.map(a => a.path === placeholderPath
          ? { path: data.path, filename: data.filename, mime_type: data.mime_type, size_bytes: data.size_bytes }
          : a
        ));
      } catch {
        setAttachError(`Could not upload "${file.name}".`);
        setPendingAttachments(prev => prev.filter(a => a.path !== placeholderPath));
      }
    }
  };

  const removePendingAttachment = (path: string) => {
    setPendingAttachments(prev => prev.filter(a => a.path !== path));
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const showSendNotice = (reason: SendNoticeReason) => {
    setSendNotice(
      reason === 'agent_inactive'
        ? (role === 'owner' ? 'This agent is switched off — switch it back on in its Agent Profile to continue.' : 'This agent has been switched off by its owner.')
        : reason === 'subscription_inactive'
        ? 'This agent’s subscription is inactive — kindly activate the subscription to continue.'
        : reason === 'credits_exhausted'
          ? 'This agent is out of funds — please add funds to continue.'
          : 'Your message could not be sent — it has been put back in the box, please try again.'
    );
    if (sendNoticeTimer.current) clearTimeout(sendNoticeTimer.current);
    sendNoticeTimer.current = setTimeout(() => setSendNotice(null), 4000);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    const attachmentsReady = pendingAttachments.filter(a => !a.uploading);
    if ((!trimmed && attachmentsReady.length === 0) || sending || !chatId || paused) return;
    if (pendingAttachments.some(a => a.uploading)) return;
    // Input stays exactly as-is on purpose — only the send attempt is
    // blocked, with a notice explaining why, rather than disabling the box.
    if (accessBlocked) { showSendNotice(accessBlocked); return; }

    // `sending` covers ONLY the insert round-trip (a fraction of a second) — never
    // the assistant's run. The box is free again immediately, so several messages
    // can be sent back to back; bemain queues them per chat and answers them in order.
    const draftAttachments = pendingAttachments;
    setSending(true);
    setInput('');
    setPendingAttachments([]);
    setAttachError(null);
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }

    const supabase = createClient();
    const { error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId, role: 'user', content: trimmed, status: 'queued',
        ...(attachmentsReady.length > 0
          ? { metadata: { attachments: attachmentsReady.map(({ path, filename, mime_type, size_bytes }) => ({ path, filename, mime_type, size_bytes })) } }
          : {}),
      });

    if (error) {
      console.error('Send failed:', error.message);
      // Give the draft back instead of silently losing it (unless they've already started a new one).
      setInput(cur => cur || trimmed);
      setPendingAttachments(cur => (cur.length === 0 ? draftAttachments : cur));
      showSendNotice('send_failed');
    }
    setSending(false);
    inputRef.current?.focus();
    // Realtime INSERT event adds the message to state.
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={20} color="#C9C4B2" />
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', minHeight: 0 }}>
      <style>{`
        .md-content { font-size: 0.875rem; line-height: 1.7; color: #1A190F; font-weight: 400; overflow-x: hidden; max-width: 100%; overflow-wrap: break-word; }
        .md-content p { margin: 0 0 0.65rem; }
        .md-content p:last-child { margin-bottom: 0; }
        .md-content h1,.md-content h2,.md-content h3 { font-weight: 500; letter-spacing: -0.02em; margin: 1rem 0 0.4rem; }
        .md-content h1 { font-size: 1.1rem; }
        .md-content h2 { font-size: 1rem; }
        .md-content h3 { font-size: 0.9rem; }
        .md-content ul,.md-content ol { margin: 0 0 0.65rem 1.25rem; padding: 0; }
        .md-content li { margin-bottom: 0.2rem; }
        .md-content code { font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; background: #EDEBE2; padding: 0.1rem 0.35rem; border-radius: 3px; }
        .md-content pre { background: #1a1a1a; border-radius: 6px; padding: 0.85rem 1rem; overflow-x: auto; margin: 0.65rem 0; }
        .md-content pre code { background: none; padding: 0; color: #E2DFD3; font-size: 0.78rem; line-height: 1.6; }
        .md-content blockquote { border-left: 2px solid #DAD5C5; margin: 0 0 0.65rem; padding-left: 0.85rem; color: #67655A; }
        .md-content a { color: #1A190F; text-decoration: underline; text-underline-offset: 2px; }
        .md-content hr { border: none; border-top: 1px solid #E2DFD3; margin: 0.85rem 0; }
        .md-table-wrap { overflow-x: auto; max-width: 100%; margin-bottom: 0.65rem; }
        .md-content table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 0; }
        .md-content th { background: #EDEBE2; padding: 0.4rem 0.65rem; text-align: left; font-weight: 500; border-bottom: 1px solid #E2DFD3; white-space: nowrap; }
        .md-content td { padding: 0.35rem 0.65rem; border-bottom: 1px solid #EDEBE2; white-space: nowrap; }
      `}</style>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2.5rem 1rem', minHeight: 0 }}
      >
        <div style={{ width: '100%' }}>
          {/* Load more indicator at top */}
          {loadingMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0' }}>
              <Spinner size={14} color="#C9C4B2" />
            </div>
          )}
          {!hasMore && messages.length > 0 && (
            <p style={{ textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.62rem', color: '#DAD5C5', padding: '0.5rem 0 0.75rem', margin: 0 }}>
              beginning of conversation
            </p>
          )}
          <div ref={topRef} />

          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: '0.75rem' }}>
              <div style={{ width: 42, height: 42, background: '#26251E', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                  <rect x="3" y="2" width="2" height="10" fill="white" />
                  <rect x="3" y="2" width="6" height="2" fill="white" />
                  <rect x="3" y="6" width="5" height="2" fill="white" />
                  <rect x="7" y="2" width="2" height="6" fill="white" />
                </svg>
              </div>
              <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: 0 }}>
                {agent?.name ?? 'Agent'} is ready.
              </p>
              <p style={{ fontSize: '0.8rem', color: '#9E9C8F', fontWeight: 300, margin: 0, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                {agent?.goal ?? 'Start the conversation to get going.'}
              </p>
            </div>
          )}

          {messages
            .filter(msg => !(msg.role === 'assistant' && msg.status !== 'failed' && !msg.content))
            .map(msg => (
            <div
              key={msg.id}
              style={{
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', color: '#7A7868', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {msg.role === 'user' ? 'you' : agent?.name ?? 'agent'}
                </span>
                {(() => {
                  const badge = messageBadge(msg);
                  if (!badge) return null;
                  const c = BADGE_STYLE[badge.kind];
                  return (
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: c.color, background: c.background, border: `1px solid ${c.border}`, borderRadius: 3, padding: '0.05rem 0.35rem' }}>
                      {badge.label}
                    </span>
                  );
                })()}
              </span>

              {/* Bubble */}
              <div style={{
                maxWidth: msg.role === 'user' ? 'min(65%, 640px)' : 'min(100%, 820px)',
                padding: msg.role === 'user' ? '0.6rem 0.9rem' : '0.75rem 1rem',
                borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                background: msg.role === 'user' ? '#E6EFFA' : '#EDEBE2',
                border: msg.role === 'user' ? '1px solid #D3E1F2' : 'none',
                color: '#1A190F',
              }}>
                {msg.role === 'user' ? (
                  <p style={{ fontSize: '0.875rem', lineHeight: 1.6, margin: 0, fontWeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </p>
                ) : msg.status === 'failed' ? (
                  <p style={{ fontSize: '0.82rem', color: '#B34A3C', margin: 0 }}>
                    {msg.content || 'Something went wrong. Please try again.'}
                  </p>
                ) : (
                  <div className="md-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content || '…'}</ReactMarkdown>
                  </div>
                )}
              </div>

              {msg.metadata?.attachments && (
                <AttachmentChips agentId={agentId} attachments={msg.metadata.attachments} />
              )}

              {/* Time of the agent's reply, same style as the one under a user message */}
              {msg.role !== 'user' && (
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', color: '#7A7868', marginTop: '0.25rem' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}

              {/* Delivery status — sent / picked up / answered */}
              {msg.role === 'user' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', color: '#7A7868' }}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Ticks status={msg.status} />
                </div>
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid #E2DFD3', background: '#F7F6F2', padding: '1rem 2.5rem 1.25rem', flexShrink: 0 }}>
        <div style={{ width: '100%' }}>
          {pendingAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
              {pendingAttachments.map(a => (
                <div
                  key={a.path}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '0.3rem 0.5rem', maxWidth: 200, opacity: a.uploading ? 0.6 : 1 }}
                >
                  {a.uploading
                    ? <Spinner size={12} color="#9E9C8F" />
                    : <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M4 2h5l3 3v7a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="#67655A" strokeWidth="1" /></svg>
                  }
                  <span style={{ fontSize: '0.72rem', color: '#3A3830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.filename}
                  </span>
                  {!a.uploading && (
                    <button
                      onClick={() => removePendingAttachment(a.path)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0, color: '#9E9C8F' }}
                      title="Remove"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.3" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {attachError && (
            <p style={{ fontSize: '0.72rem', color: '#B34A3C', margin: '0 0 0.5rem' }}>{attachError}</p>
          )}

          {/* Subscription/credit gate banner — informational, always visible
              while blocked; the input itself stays fully usable, only the
              send attempt is actually stopped (see showSendNotice below). */}
          {accessBlocked && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
              background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 6,
              padding: '0.5rem 0.75rem', marginBottom: '0.6rem',
            }}>
              <span style={{ fontSize: '0.78rem', color: '#8A3529', lineHeight: 1.4 }}>
                {accessBlocked === 'agent_inactive'
                  ? (role === 'owner'
                    ? 'This agent is switched off, so it won’t answer, run tasks or take shifts until you switch it back on.'
                    : 'This agent has been switched off by its owner, so it can’t answer right now.')
                  : accessBlocked === 'subscription_inactive'
                  ? (role === 'owner'
                    ? "This agent's subscription is inactive — renew it to keep chatting."
                    : "This agent's subscription is inactive. Let the agent owner know to renew it.")
                  : (role === 'owner'
                    ? 'This agent is out of funds — add funds to keep chatting.'
                    : 'This agent is out of funds. Let the agent owner know to add funds.')}
              </span>
              {role === 'owner' && (
                <a
                  href={accessBlocked === 'agent_inactive' ? `/agents/${agentId}/settings` : accessBlocked === 'subscription_inactive' ? '/account/organizations' : '/account/billing'}
                  style={{ fontSize: '0.76rem', color: '#8A3529', fontWeight: 500, textDecoration: 'underline', flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  {accessBlocked === 'agent_inactive' ? 'Open Agent Profile' : accessBlocked === 'subscription_inactive' ? 'Renew subscription' : 'Add funds'}
                </a>
              )}
            </div>
          )}
          {sendNotice && (
            <div style={{
              background: '#26251E', color: '#F7F6F2', borderRadius: 6,
              padding: '0.5rem 0.75rem', marginBottom: '0.6rem', fontSize: '0.78rem', lineHeight: 1.4,
            }}>
              {sendNotice}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFilesSelected}
            style={{ display: 'none' }}
          />
          <div
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', background: '#fff', border: '1px solid #DAD5C5', borderRadius: 10, padding: '0.5rem 0.5rem 0.5rem 0.9rem', transition: 'border-color 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
            onFocusCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#26251E'}
            onBlurCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#DAD5C5'}
          >
            <button
              onClick={handleAttachClick}
              disabled={paused || pendingAttachments.length >= MAX_ATTACHMENTS}
              title="Attach file"
              style={{ width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: 'transparent', cursor: paused || pendingAttachments.length >= MAX_ATTACHMENTS ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E9C8F' }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M11 4.5L5.5 10a2 2 0 002.83 2.83L14 7.17a3.5 3.5 0 00-4.95-4.95L3.5 7.77a5 5 0 007.07 7.07" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={paused ? 'Access to this agent has been paused by its admin…' : `Message ${agent?.name ?? 'the agent'}…`}
              rows={1}
              maxLength={5000}
              disabled={paused}
              style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: '0.875rem', fontFamily: "'Inter',sans-serif", color: '#1A190F', background: 'transparent', lineHeight: 1.6, maxHeight: 160, overflowY: 'auto', paddingTop: '0.1rem' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 160) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || paused || (!input.trim() && pendingAttachments.length === 0) || pendingAttachments.some(a => a.uploading)}
              style={{ width: 32, height: 32, borderRadius: 7, border: 'none', flexShrink: 0, background: (!input.trim() && pendingAttachments.length === 0) || sending || paused || pendingAttachments.some(a => a.uploading) ? '#E2DFD3' : '#26251E', cursor: (!input.trim() && pendingAttachments.length === 0) || sending || paused || pendingAttachments.some(a => a.uploading) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
            >
              {sending
                ? <Spinner size={12} color="#fff" />
                : <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M12 2L2 7l4 2 1 4 5-11z" stroke="white" strokeWidth="1.3" strokeLinejoin="round" /></svg>
              }
            </button>
          </div>
          <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', color: '#7A7868', margin: '0.4rem 0 0', textAlign: 'center' }}>
            {paused ? 'You can still read past messages, but sending is disabled while access is paused.' : 'Enter to send · Shift+Enter for new line'}
          </p>
        </div>
      </div>
    </div>
  );
}