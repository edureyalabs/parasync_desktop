// src/renderer/src/components/MessageBubble.tsx
// WhatsApp-style bubbles: incoming on the left (white), outgoing on the right (brass tint), time and delivery ticks
// inside the bubble.
import { memo, useState } from 'react';

import { DeliveryTicks } from '@/components/Icon';
import { Markdown } from '@/components/Markdown';
import { clock } from '@/lib/chatTime';
import { C, MONO } from '@/lib/theme';
import type { ChatMessage } from '@/lib/types';

const PROJECT_LABEL: Record<string, string> = {
  report: 'Project report', update: 'Project update', question: 'Project question',
  failed: 'Project stopped', expired: 'Project ended', cancelled: 'Project cancelled',
};
const FOLLOWUP_LABEL: Record<string, string> = {
  report: 'Follow-up update', update: 'Follow-up update',
  failed: 'Follow-up stopped', expired: 'Follow-up ended', cancelled: 'Follow-up cancelled',
};
const BADGE_STYLE = {
  project: { color: '#5B4B8A', background: '#EAE5F4' },
  followup: { color: '#2F6B78', background: '#E3F0F2' },
  task: { color: '#7C5F27', background: '#F6EBCB' },
} as const;

function badgeFor(m: ChatMessage): { label: string; kind: keyof typeof BADGE_STYLE } | null {
  const src = m.metadata?.source;
  if (src === 'project') return { label: PROJECT_LABEL[m.metadata?.kind ?? ''] ?? 'Project update', kind: 'project' };
  if (src === 'followup') return { label: FOLLOWUP_LABEL[m.metadata?.kind ?? ''] ?? 'Follow-up update', kind: 'followup' };
  if (m.role === 'task') return { label: 'Task update', kind: 'task' };
  return null;
}

function Ticks({ status }: { status: ChatMessage['status'] }) {
  if (status === 'failed') return <span style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>!</span>;
  const double = status === 'processing' || status === 'completed';
  return <DeliveryTicks double={double} color={status === 'completed' ? C.blue : '#8E8B7B'} />;
}

// Very long replies are shown shortened with "Read more", so one message can never take over the whole window.
const COLLAPSE_AT = 2200;
const HARD_LIMIT = 40000;

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let cut = text.slice(0, limit);
  const nl = cut.lastIndexOf('\n');
  if (nl > limit * 0.6) cut = cut.slice(0, nl);
  if ((cut.match(/```/g) ?? []).length % 2 === 1) cut += '\n```'; // never leave a code block open
  return cut;
}

function BubbleImpl({ message, newSpeaker }: { message: ChatMessage; newSpeaker: boolean }) {
  const isUser = message.role === 'user';
  const badge = badgeFor(message);
  const [expanded, setExpanded] = useState(false);
  const long = !isUser && message.content.length > COLLAPSE_AT;
  const shown = !long ? message.content : expanded ? clip(message.content, HARD_LIMIT) : clip(message.content, COLLAPSE_AT);
  const truncated = long && expanded && message.content.length > HARD_LIMIT;
  const files = message.metadata?.attachments ?? [];

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginTop: newSpeaker ? 14 : 5, padding: '0 28px' }}>
      <div
        style={{
          maxWidth: isUser ? '68%' : '78%', minWidth: 76,
          background: isUser ? C.outgoing : '#fff',
          borderRadius: 10, borderTopRightRadius: isUser ? 2 : 10, borderTopLeftRadius: isUser ? 10 : 2,
          padding: '7px 11px 5px', boxShadow: '0 1px 1px rgba(0,0,0,0.07)',
        }}
      >
        {badge && (
          <span style={{ display: 'inline-block', fontFamily: MONO, fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase', color: BADGE_STYLE[badge.kind].color, background: BADGE_STYLE[badge.kind].background, borderRadius: 3, padding: '1px 5px', marginBottom: 4 }}>
            {badge.label}
          </span>
        )}
        {isUser ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#1A190F', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }}>{message.content}</div>
        ) : message.status === 'failed' ? (
          <div style={{ fontSize: 13, color: C.red }}>{message.content || 'Something went wrong. Please try again.'}</div>
        ) : (
          <div style={{ userSelect: 'text' }}><Markdown>{shown || '…'}</Markdown></div>
        )}
        {long && (
          <button onClick={() => setExpanded((e) => !e)} style={{ background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, color: '#1A5FA0' }}>
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        {truncated && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>This message is very long, so only the start is shown. Open it on the web for the full text.</div>}
        {files.length > 0 && (
          <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {files.map((f) => (
              <span key={f.path} title="Downloads are available on the web for now" style={{ fontSize: 11.5, color: C.muted, background: C.sunken, border: `1px solid ${C.line}`, borderRadius: 5, padding: '2px 7px' }}>
                📎 {f.filename}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: '#7A7868' }}>{clock(message.created_at)}</span>
          {isUser && <Ticks status={message.status} />}
        </div>
      </div>
    </div>
  );
}

export const MessageBubble = memo(BubbleImpl);

export function DaySeparator({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 4px' }}>
      <span style={{ fontSize: 11.5, color: '#6B6959', background: 'rgba(255,255,255,0.88)', borderRadius: 8, padding: '4px 11px', fontWeight: 500 }}>{label}</span>
    </div>
  );
}
