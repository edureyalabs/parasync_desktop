// components/whatsapp/ConfigModal.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Btn, Chip, EmptyState } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate, fmtTime } from '@/components/account/format';
import {
  ACCESS_LABEL, CONTEXT_MAX, EVENT_LABEL, EVENT_TONE, formatPhone, MAX_SEND_CAP, MIN_SEND_CAP, RETENTION_DAYS, WA_LIMITS,
  type WaAccess, type WaChat, type WaEvent,
} from '@/lib/whatsapp';

// Everything about how the agent uses WhatsApp, kept out of the conversation view so that gets the screen: which groups and contacts it may read or write to (and a note on
// what each is for), adding a contact by number, the daily sending limit, how long things are kept, and the connection history. Changes save as they are made, like the
// rest of the tab; there is no draft to lose.

const CHAT_PAGE = 80;

type Filter = 'all' | 'groups' | 'contacts' | 'open';

const inputStyle: React.CSSProperties = {
  padding: '0.45rem 0.6rem', fontSize: '0.8rem', fontFamily: "'Inter', sans-serif", border: '1px solid #DAD5C5', borderRadius: 6, color: C.ink, background: '#fff', outline: 'none',
};

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', margin: '0 0 0.7rem', flexWrap: 'wrap' }}>
      <h3 style={{ fontFamily: MONO, fontSize: '0.66rem', fontWeight: 500, color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>{children}</h3>
      {aside}
    </div>
  );
}

function ChatRow({ chat, onAccess, onContext, onRemove }: {
  chat: WaChat;
  onAccess: (chat: WaChat, access: WaAccess) => void;
  onContext: (chat: WaChat, text: string) => Promise<boolean>;
  onRemove: (chat: WaChat) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(chat.context ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = text.trim() !== (chat.context ?? '');
  const label = chat.name?.trim() || chat.jid.split('@')[0];

  const save = async () => {
    setSaving(true);
    setError('');
    const ok = await onContext(chat, text.trim());
    setSaving(false);
    if (!ok) setError('Could not save the note. Try again.');
  };

  return (
    <div style={{ borderTop: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.8rem', alignItems: 'center', padding: '0.5rem 0.2rem' }}>
        <button
          type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          style={{ textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 0, fontFamily: "'Inter', sans-serif" }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
            <span style={{ fontSize: '0.82rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            <Chip tone="neutral">{chat.kind === 'group' ? 'Group' : 'Contact'}</Chip>
            {!chat.active && <Chip tone="amber">Left</Chip>}
            {chat.context && <Chip tone="brass">Note</Chip>}
          </span>
          <span style={{ display: 'block', fontSize: '0.68rem', color: C.muted, marginTop: '0.1rem' }}>
            {chat.kind === 'group' && chat.participants_count ? `${chat.participants_count} members` : formatPhone(chat.jid.split('@')[0])}
            {chat.last_message_at ? ` · last message ${fmtDate(chat.last_message_at)} ${fmtTime(chat.last_message_at)}` : ''}
          </span>
        </button>
        <select
          value={chat.access} aria-label={`Access for ${label}`} onChange={e => onAccess(chat, e.target.value as WaAccess)}
          style={{ ...inputStyle, padding: '0.3rem 0.45rem', fontSize: '0.76rem', borderColor: chat.access === 'none' ? '#DAD5C5' : C.brass }}
        >
          {(Object.keys(ACCESS_LABEL) as WaAccess[]).map(a => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
        </select>
      </div>
      {open && (
        <div style={{ padding: '0.2rem 0.6rem 0.9rem', background: C.paper, borderRadius: 6, marginBottom: '0.4rem' }}>
          <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.74rem', color: C.soft }}>
            What this chat is for (the agent reads this note along with the messages)
            <textarea
              value={text} onChange={e => setText(e.target.value.slice(0, CONTEXT_MAX))} rows={2}
              placeholder="e.g. Site purchase requests. A message with a quantity and an item is an indent."
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <Btn size="sm" variant="primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save note'}</Btn>
            <span style={{ fontSize: '0.68rem', color: C.muted }}>{text.length} / {CONTEXT_MAX}</span>
            {chat.source === 'manual' && chat.kind === 'contact' && <Btn size="sm" variant="ghost" onClick={() => onRemove(chat)}>Remove contact</Btn>}
            {error && <span style={{ fontSize: '0.72rem', color: C.red }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConfigModal({ chats, connected, busy, sendCap, events, notice, onClose, onAccess, onContext, onRemoveContact, onSyncGroups, onAddContact, onSaveSendCap }: {
  chats: WaChat[];
  connected: boolean;
  busy: string;
  sendCap: number;
  events: WaEvent[];
  notice: { ok: boolean; text: string } | null;
  onClose: () => void;
  onAccess: (chat: WaChat, access: WaAccess) => void;
  onContext: (chat: WaChat, text: string) => Promise<boolean>;
  onRemoveContact: (chat: WaChat) => void;
  onSyncGroups: () => void;
  onAddContact: (phone: string, name: string) => Promise<boolean>;
  onSaveSendCap: (value: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(CHAT_PAGE);
  const [addOpen, setAddOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openCount = useMemo(() => chats.filter(c => c.access !== 'none').length, [chats]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter(c => filter === 'all' || (filter === 'groups' && c.kind === 'group') || (filter === 'contacts' && c.kind === 'contact') || (filter === 'open' && c.access !== 'none'))
      .filter(c => !q || (c.name ?? '').toLowerCase().includes(q) || c.jid.includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active));
  }, [chats, filter, search]);

  const add = async () => {
    if (await onAddContact(phone, name)) { setPhone(''); setName(''); setAddOpen(false); }
  };

  return (
    <div
      role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.38)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: "'Inter', 'Helvetica Neue', sans-serif" }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="WhatsApp configuration"
        style={{ width: '100%', maxWidth: 760, maxHeight: 'calc(100vh - 2rem)', display: 'flex', flexDirection: 'column', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 24px 60px rgba(38,37,30,0.22)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.4rem', borderBottom: `1px solid ${C.lineSoft}` }}>
          <div>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, color: '#514726', margin: 0 }}>WhatsApp configuration</h2>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: C.soft }}>Which chats the agent may use, its sending limit, and the connection history.</p>
          </div>
          <Btn size="sm" variant="ghost" onClick={onClose} aria-label="Close">Close</Btn>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.4rem 1.4rem', display: 'grid', gap: '1.8rem', alignContent: 'start' }}>
          {notice && (
            <p style={{ fontSize: '0.78rem', color: notice.ok ? C.green : C.red, background: notice.ok ? C.greenWash : C.redWash, border: `1px solid ${notice.ok ? C.greenLine : C.redLine}`, borderRadius: 6, padding: '0.5rem 0.75rem', margin: 0 }}>
              {notice.text}
            </p>
          )}

          <section>
            <SectionTitle aside={<span style={{ fontSize: '0.72rem', color: C.muted }}>{openCount} open · Read stores a chat&rsquo;s messages from now on; Send lets the agent write there</span>}>Chats</SectionTitle>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              <input value={search} onChange={e => { setSearch(e.target.value); setShown(CHAT_PAGE); }} placeholder="Search chats" aria-label="Search chats" style={{ ...inputStyle, flex: '1 1 180px', minWidth: 0 }} />
              {(['all', 'groups', 'contacts', 'open'] as Filter[]).map(f => (
                <button
                  key={f} type="button" onClick={() => { setFilter(f); setShown(CHAT_PAGE); }}
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.74rem', padding: '0.3rem 0.7rem', borderRadius: 6, cursor: 'pointer', border: `1px solid ${filter === f ? C.ink : '#DAD5C5'}`, background: filter === f ? C.ink : 'transparent', color: filter === f ? '#F7F6F2' : C.body, textTransform: 'capitalize' }}
                >{f}</button>
              ))}
              {connected && (
                <span style={{ display: 'flex', gap: '0.4rem' }}>
                  <Btn size="sm" onClick={() => setAddOpen(o => !o)}>{addOpen ? 'Close' : 'Add contact'}</Btn>
                  <Btn size="sm" onClick={onSyncGroups} disabled={!!busy}>{busy === 'groups' ? 'Refreshing…' : 'Refresh groups'}</Btn>
                </span>
              )}
            </div>
            {addOpen && connected && (
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="919876543210" aria-label="Contact phone number" style={{ ...inputStyle, flex: '1 1 170px', minWidth: 0, fontFamily: MONO }} />
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" aria-label="Contact name" style={{ ...inputStyle, flex: '1 1 140px', minWidth: 0 }} />
                <Btn size="sm" variant="primary" onClick={add} disabled={!!busy || phone.replace(/\D/g, '').length < 8}>{busy === 'contact' ? 'Adding…' : 'Add'}</Btn>
              </div>
            )}
            <div style={{ maxHeight: 'min(46vh, 420px)', overflowY: 'auto', borderBottom: `1px solid ${C.lineSoft}` }}>
              {visible.length === 0 ? (
                <EmptyState icon="💬" title={chats.length === 0 ? 'No chats yet' : 'No chats match'}>
                  {chats.length === 0
                    ? (connected ? 'Your groups appear here a few seconds after connecting. Use Refresh groups if they do not.' : 'Connect the number and its groups will be listed here.')
                    : 'Try a different search or filter.'}
                </EmptyState>
              ) : (
                <>
                  {visible.slice(0, shown).map(c => <ChatRow key={c.id} chat={c} onAccess={onAccess} onContext={onContext} onRemove={onRemoveContact} />)}
                  {visible.length > shown && (
                    <div style={{ borderTop: `1px solid ${C.lineSoft}`, padding: '0.7rem 0', textAlign: 'center' }}>
                      <Btn size="sm" onClick={() => setShown(n => n + CHAT_PAGE)}>Show more ({visible.length - shown} left)</Btn>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section>
            <SectionTitle>Sending limit</SectionTitle>
            <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.78rem', color: C.soft, maxWidth: 520 }}>
              Messages the agent may send per 24 hours
              <input
                key={sendCap} type="number" min={MIN_SEND_CAP} max={MAX_SEND_CAP} defaultValue={sendCap} aria-label="Daily sending limit"
                onBlur={e => { if (Number(e.target.value) !== sendCap) onSaveSendCap(Number(e.target.value)); }} style={{ ...inputStyle, width: 120 }}
              />
              <span style={{ fontSize: '0.7rem', color: C.muted, lineHeight: 1.5 }}>Keep this low. Bulk or unsolicited messaging is the quickest way for WhatsApp to restrict a number.</span>
            </label>
            <p style={{ fontSize: '0.72rem', color: C.muted, lineHeight: 1.6, margin: '0.8rem 0 0' }}>
              Also enforced for every send: a message of up to {WA_LIMITS.sendTextMaxChars.toLocaleString('en-US')} characters, a file of up to {WA_LIMITS.sendFileMaxMb} MB, and an identical message to the same chat is not sent again within {WA_LIMITS.duplicateWindowMinutes} minutes.
            </p>
          </section>

          <section>
            <SectionTitle>What is kept</SectionTitle>
            <p style={{ fontSize: '0.76rem', color: C.soft, lineHeight: 1.65, margin: 0 }}>
              Messages from the chats you open, what the agent sent, and their attachments are deleted automatically after {RETENTION_DAYS} days: the database removes the files first and then the records, every hour.
              Attachments are kept in this agent&rsquo;s workspace, in the <strong>whatsapp</strong> folder. Unlinking the number deletes everything stored for it immediately.
            </p>
          </section>

          <section>
            <SectionTitle aside={<span style={{ fontSize: '0.72rem', color: C.muted }}>newest first · kept 30 days</span>}>Connection history</SectionTitle>
            {events.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: C.muted, margin: 0 }}>Nothing recorded yet. Connection changes (connected, lost, reconnected, unlinked) are listed here.</p>
            ) : (
              <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, overflow: 'hidden' }}>
                {events.map((ev, i) => (
                  <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '118px minmax(0, 1fr)', gap: '0.8rem', padding: '0.5rem 0.8rem', borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}`, alignItems: 'start' }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: C.muted }}>{fmtDate(ev.at)}<br />{fmtTime(ev.at)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <Chip tone={EVENT_TONE[ev.event] ?? 'neutral'}>{EVENT_LABEL[ev.event] ?? ev.event}</Chip>
                        {ev.code != null && <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted }}>code {ev.code}</span>}
                      </span>
                      {ev.detail && <span style={{ display: 'block', fontSize: '0.74rem', color: C.soft, lineHeight: 1.5, marginTop: '0.2rem', wordBreak: 'break-word' }}>{ev.detail}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
