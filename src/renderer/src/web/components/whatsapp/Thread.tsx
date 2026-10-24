// components/whatsapp/Thread.tsx
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Btn, Chip } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtTime } from '@/components/account/format';
import { RETENTION_DAYS, type WaChat, type WaSent } from '@/lib/whatsapp';
import { chatLabel } from './ChatList';

// The right pane: what the agent sent to the chosen chat and when, oldest to newest like a WhatsApp conversation, with a day heading between days. It shows only what the
// agent SENT (the sent records, which the owner can read); messages other people wrote are read by the agent but are not shown here.

function dayHeading(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function Thread({ chat, rows, truncated, onBack }: {
  chat: WaChat;
  rows: WaSent[];                      // newest first, as loaded
  truncated: boolean;                  // the sent history held more than was loaded
  onBack: () => void;
}) {
  const ordered = useMemo(() => [...rows].reverse(), [rows]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.jid, ordered.length]);

  const canSend = chat.access === 'send' || chat.access === 'both';

  return (
    <article className="wa-read" aria-label={`Messages sent to ${chatLabel(chat)}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.7rem 1.1rem', borderBottom: `1px solid ${C.lineSoft}`, background: C.card, flexShrink: 0 }}>
        <span className="wa-back"><Btn size="sm" variant="ghost" onClick={onBack}>← Back</Btn></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <h2 style={{ fontSize: '0.98rem', fontWeight: 500, margin: 0, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chatLabel(chat)}</h2>
            <Chip tone="neutral">{chat.kind === 'group' ? 'Group' : 'Contact'}</Chip>
            {!chat.active && <Chip tone="amber">Left</Chip>}
          </div>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chat.context ? `Note: ${chat.context}` : chat.kind === 'group' && chat.participants_count ? `${chat.participants_count} members` : 'Messages the agent sent here'}
          </p>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.paper, padding: '1rem 1.2rem 1.2rem' }}>
        {truncated && <p style={{ textAlign: 'center', fontSize: '0.72rem', color: C.muted, margin: '0 0 0.8rem' }}>Showing the most recent messages.</p>}
        {ordered.length === 0 ? (
          <div style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: C.muted }}>
            <div style={{ maxWidth: 360 }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.55 }}>💬</span>
              <p style={{ fontSize: '0.86rem', margin: 0, lineHeight: 1.6 }}>
                {canSend
                  ? 'The agent has not sent anything here yet. When it does, each message appears with its time and delivery status.'
                  : 'This chat is read-only for the agent: it can read new messages here but cannot write to it. Set it to Send or Both in Config to let it reply.'}
              </p>
            </div>
          </div>
        ) : ordered.map((m, i) => {
          const newDay = i === 0 || !sameDay(ordered[i - 1]!.created_at, m.created_at);
          const failed = m.status === 'failed';
          return (
            <div key={m.id}>
              {newDay && (
                <div style={{ textAlign: 'center', margin: i === 0 ? '0 0 0.7rem' : '1rem 0 0.7rem' }}>
                  <span style={{ fontFamily: MONO, fontSize: '0.64rem', letterSpacing: '0.05em', color: C.soft, background: C.card, border: `1px solid ${C.lineSoft}`, borderRadius: 999, padding: '0.2rem 0.7rem' }}>{dayHeading(m.created_at)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 0.45rem' }}>
                <div
                  style={{
                    maxWidth: 'min(78%, 560px)', background: failed ? C.redWash : C.brassTint, border: `1px solid ${failed ? C.redLine : C.brassLine}`,
                    borderRadius: '12px 12px 3px 12px', padding: '0.5rem 0.75rem 0.35rem',
                  }}
                >
                  {m.text && <div style={{ fontSize: '0.86rem', lineHeight: 1.55, color: C.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>}
                  {m.attachment_name && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: m.text ? '0.35rem' : 0, fontSize: '0.76rem', color: C.body, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: '0.3rem 0.6rem', maxWidth: '100%' }}>
                      <span aria-hidden>📎</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.attachment_name}</span>
                    </div>
                  )}
                  {failed && m.error && <div style={{ fontSize: '0.72rem', color: C.red, marginTop: '0.3rem' }}>{m.error}</div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', fontFamily: MONO, fontSize: '0.62rem', color: failed ? C.red : C.muted }}>
                    <span>{fmtTime(m.created_at)}</span>
                    <span title={m.status === 'sent' ? 'Handed to WhatsApp' : m.status === 'failed' ? 'Not sent' : 'Sending'}>{m.status === 'sent' ? '✓ Sent' : failed ? '✗ Failed' : '… Sending'}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <footer style={{ padding: '0.45rem 1.1rem', borderTop: `1px solid ${C.lineSoft}`, background: C.card, fontSize: '0.68rem', color: C.muted, flexShrink: 0 }}>
        What the agent sent, kept for {RETENTION_DAYS} days. You cannot type here: the agent writes only when a chat or task asks it to.
      </footer>
    </article>
  );
}
