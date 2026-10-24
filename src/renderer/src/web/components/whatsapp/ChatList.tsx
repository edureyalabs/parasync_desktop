// components/whatsapp/ChatList.tsx
'use client';

import { Btn, Chip, EmptyState } from '@/components/account/ui';
import { C } from '@/components/account/tokens';
import { initials } from '@/components/account/format';
import { ACCESS_LABEL, formatPhone, type WaAccess, type WaChat, type WaSent } from '@/lib/whatsapp';

// The left pane of the WhatsApp tab: only the chats the owner opened for the agent (access read, send or both), newest agent activity first, like the chat list in WhatsApp Web.
// Choosing which chats are open, and every other setting, lives in the Config dialog.

export function chatLabel(chat: Pick<WaChat, 'name' | 'jid'>): string {
  return chat.name?.trim() || formatPhone(chat.jid.split('@')[0]) || chat.jid;
}

/** "10:42 AM" today, "Yesterday", else "Oct 21". */
export function listStamp(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const days = Math.floor((startOfDay(now) - startOfDay(d.getTime())) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const ACCESS_TONE: Record<WaAccess, 'neutral' | 'slate' | 'brass' | 'green'> = { none: 'neutral', read: 'slate', send: 'brass', both: 'green' };

export function ChatList({ chats, lastSent, selectedJid, search, onSearch, onSelect, onOpenConfig, connected, hasAnyChat }: {
  chats: WaChat[];                                    // already limited to the opened chats
  lastSent: Map<string, WaSent>;                      // newest thing the agent sent, per chat
  selectedJid: string | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (jid: string) => void;
  onOpenConfig: () => void;
  connected: boolean;
  hasAnyChat: boolean;                                // whether any chats exist at all (opened or not)
}) {
  const q = search.trim().toLowerCase();
  const shown = chats.filter(c => !q || chatLabel(c).toLowerCase().includes(q) || c.jid.includes(q));

  return (
    <section className="wa-list" aria-label="Chats the agent can use">
      <div style={{ padding: '0.6rem 0.8rem', borderBottom: `1px solid ${C.lineSoft}` }}>
        <input
          value={search} onChange={e => onSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats"
          style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem 0.8rem', fontSize: '0.8rem', fontFamily: "'Inter', sans-serif", border: `1px solid ${C.line}`, borderRadius: 999, background: C.surface, color: C.ink, outline: 'none' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {chats.length === 0 ? (
          <EmptyState
            icon="💬" title="No chats opened yet"
            action={connected || hasAnyChat ? <Btn size="sm" variant="primary" onClick={onOpenConfig}>Open Config</Btn> : undefined}
          >
            {connected || hasAnyChat
              ? 'Choose which groups and contacts the agent may read or write to in Config. They appear here.'
              : 'Connect the number first. Its groups appear in Config, where you choose which ones the agent can use.'}
          </EmptyState>
        ) : shown.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: C.muted, textAlign: 'center', padding: '1.5rem 1rem', margin: 0 }}>No chat matches that search.</p>
        ) : shown.map(c => {
          const last = lastSent.get(c.jid);
          const preview = last ? (last.text?.trim() || (last.attachment_name ? `📎 ${last.attachment_name}` : '')) : '';
          const stamp = last ? last.created_at : c.last_message_at;
          return (
            <button key={c.id} type="button" className="wa-row" aria-current={selectedJid === c.jid} onClick={() => onSelect(c.jid)}>
              <span aria-hidden style={{ width: 36, height: 36, borderRadius: '50%', background: c.kind === 'group' ? C.slateWash : C.brassWash, color: c.kind === 'group' ? C.slate : C.brassDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.76rem', fontWeight: 500 }}>
                {initials(chatLabel(c)) || '#'}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 500, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chatLabel(c)}</span>
                <span style={{ display: 'block', fontSize: '0.76rem', color: last ? C.body : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {last ? (last.status === 'failed' ? '⚠ ' : '') + (preview || 'Message') : c.access === 'read' ? 'Read only' : 'Nothing sent yet'}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.64rem', color: C.muted, whiteSpace: 'nowrap' }}>{stamp ? listStamp(stamp) : ''}</span>
                <Chip tone={ACCESS_TONE[c.access]}>{ACCESS_LABEL[c.access].replace('Read and send', 'Both')}</Chip>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
