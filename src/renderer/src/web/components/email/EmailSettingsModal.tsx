// components/email/EmailSettingsModal.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { copyText } from '@/components/agent-ui/clipboard';
import { Btn, Chip } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import {
  MAX_ALLOWED_RECIPIENTS, MAX_DAILY_CAP, MIN_DAILY_CAP, normalizeAllowEntry, REPLY_TO_LABELS, type ReplyToMode,
} from '@/lib/agentEmail';

// Everything about how the agent's email is configured, kept out of the inbox so the mail itself gets the screen: the sender address, who the agent may
// email, the daily limit and where replies go. The Email tab mounts this fresh each time it opens, so the draft always starts from what is saved.

export interface EmailSettings {
  allow_any_recipient: boolean;
  allowed_recipients: string[];
  daily_cap: number;
  reply_to_mode: ReplyToMode;
  suspended: boolean;
  suspended_reason: string | null;
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.65rem', fontSize: '0.82rem', fontFamily: "'Inter', sans-serif", border: '1px solid #DAD5C5', borderRadius: 6, color: C.ink, background: '#fff', outline: 'none',
};

function sameSettings(a: EmailSettings, b: EmailSettings): boolean {
  return a.allow_any_recipient === b.allow_any_recipient && a.daily_cap === b.daily_cap && a.reply_to_mode === b.reply_to_mode
    && a.allowed_recipients.length === b.allowed_recipients.length && a.allowed_recipients.every((v, i) => v === b.allowed_recipients[i]);
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      style={{ width: 34, height: 19, borderRadius: 10, border: 'none', cursor: 'pointer', background: on ? C.ink : '#DAD5C5', position: 'relative', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontFamily: MONO, fontSize: '0.66rem', fontWeight: 500, color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.7rem' }}>{children}</h3>;
}

export function EmailSettingsModal({ agentId, agentName, address, saved, onSaved, onClose }: {
  agentId: string;
  agentName: string;
  address: string;
  saved: EmailSettings;
  onSaved: (next: EmailSettings) => void;
  onClose: () => void;
}) {
  const [base, setBase] = useState<EmailSettings>(saved);
  const [draft, setDraft] = useState<EmailSettings>(saved);
  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const dirty = useMemo(() => !sameSettings(base, draft), [base, draft]);

  const requestClose = () => {
    if (dirty && !saving) { setConfirmLeave(true); return; }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dirty && !saving) setConfirmLeave(true);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, onClose]);

  const addEntry = () => {
    const normalized = normalizeAllowEntry(entry);
    if (!normalized) { setEntryError('Enter an address like alex@example.com, or a whole domain like @example.com.'); return; }
    if (draft.allowed_recipients.includes(normalized)) { setEntryError('Already in the list.'); return; }
    if (draft.allowed_recipients.length >= MAX_ALLOWED_RECIPIENTS) { setEntryError(`The list can hold at most ${MAX_ALLOWED_RECIPIENTS} entries.`); return; }
    setDraft(d => ({ ...d, allowed_recipients: [...d.allowed_recipients, normalized] }));
    setEntry('');
    setEntryError('');
  };

  const save = async () => {
    const cap = Math.round(Number(draft.daily_cap));
    if (!Number.isFinite(cap) || cap < MIN_DAILY_CAP || cap > MAX_DAILY_CAP) {
      setMessage({ ok: false, text: `The daily limit must be between ${MIN_DAILY_CAP} and ${MAX_DAILY_CAP}.` });
      return;
    }
    setSaving(true);
    setMessage(null);
    const next: EmailSettings = { ...draft, daily_cap: cap };
    const { error } = await createClient().from('agent_email_settings').upsert({
      agent_id: agentId, allow_any_recipient: next.allow_any_recipient, allowed_recipients: next.allowed_recipients, daily_cap: next.daily_cap, reply_to_mode: next.reply_to_mode,
    }, { onConflict: 'agent_id' });
    setSaving(false);
    if (error) { setMessage({ ok: false, text: 'Could not save. Check the values and try again.' }); return; }
    setBase(next);
    setDraft(next);
    setConfirmLeave(false);
    setMessage({ ok: true, text: 'Saved.' });
    onSaved(next);
  };

  const copyAddress = async () => {
    if (await copyText(address)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.38)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: "'Inter', 'Helvetica Neue', sans-serif" }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Email settings"
        style={{ width: '100%', maxWidth: 640, maxHeight: 'calc(100vh - 2rem)', display: 'flex', flexDirection: 'column', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 24px 60px rgba(38,37,30,0.22)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.4rem', borderBottom: `1px solid ${C.lineSoft}` }}>
          <div>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.15rem', fontWeight: 500, color: '#514726', margin: 0 }}>Email settings</h2>
            <p style={{ fontSize: '0.76rem', color: C.soft, margin: '0.15rem 0 0' }}>Who this agent may email, and how.</p>
          </div>
          <button type="button" aria-label="Close settings" onClick={requestClose} style={{ border: 'none', background: 'transparent', color: C.soft, cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem 0.45rem', borderRadius: 6 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.4rem 1.4rem', display: 'grid', gap: '1.6rem', alignContent: 'start' }}>
          <section>
            <SectionTitle>Sender</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: '0.95rem', color: C.ink, wordBreak: 'break-all' }}>{address || 'No address yet'}</span>
              {address && <Btn size="sm" onClick={copyAddress}>{copied ? 'Copied' : 'Copy'}</Btn>}
              {saved.suspended ? <Chip tone="red" dot>Sending is switched off</Chip> : <Chip tone="green" dot>Active</Chip>}
            </div>
            <p style={{ fontSize: '0.78rem', color: C.soft, lineHeight: 1.6, margin: '0.6rem 0 0' }}>
              This permanent address belongs to the agent and never changes, even if you rename it. Recipients see <strong>{agentName}</strong> as the sender, with the agent&apos;s profile picture in the email. This agent sends email only; it cannot read replies yet.
            </p>
            {saved.suspended && saved.suspended_reason && <p style={{ fontSize: '0.78rem', color: C.red, margin: '0.5rem 0 0' }}>{saved.suspended_reason}</p>}
          </section>

          <section>
            <SectionTitle>Who it may email</SectionTitle>
            <p style={{ fontSize: '0.8rem', color: C.soft, lineHeight: 1.6, margin: '0 0 0.9rem' }}>
              Always allowed: the person the agent is working with, and you. Add anyone else here. Without an entry, the agent is told it may not email that address.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                value={entry} onChange={e => { setEntry(e.target.value); setEntryError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
                placeholder="alex@example.com or @example.com" aria-label="Approved address or domain" style={{ ...inputStyle, flex: '1 1 240px', minWidth: 0 }}
              />
              <Btn onClick={addEntry}>Add</Btn>
            </div>
            {entryError && <p style={{ fontSize: '0.75rem', color: C.red, margin: '0.4rem 0 0' }}>{entryError}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', margin: '0.8rem 0 0' }}>
              {draft.allowed_recipients.length === 0 && <span style={{ fontSize: '0.78rem', color: C.muted }}>No approved addresses yet.</span>}
              {draft.allowed_recipients.map(a => (
                <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: MONO, fontSize: '0.74rem', color: C.body, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 6, padding: '0.22rem 0.2rem 0.22rem 0.55rem' }}>
                  {a}
                  <button
                    type="button" aria-label={`Remove ${a}`} onClick={() => setDraft(d => ({ ...d, allowed_recipients: d.allowed_recipients.filter(x => x !== a) }))}
                    style={{ border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, padding: '0 0.3rem' }}
                  >×</button>
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', margin: '1.2rem 0 0', paddingTop: '1rem', borderTop: `1px solid ${C.lineSoft}` }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: '0 0 0.25rem' }}>Allow any recipient</p>
                <p style={{ fontSize: '0.78rem', color: C.soft, lineHeight: 1.6, margin: 0 }}>
                  Lets the agent email any address. Turn this on only if the agent&rsquo;s job needs it. The daily limit still applies, and addresses that bounced or reported an email stay blocked.
                </p>
              </div>
              <Switch on={draft.allow_any_recipient} onClick={() => setDraft(d => ({ ...d, allow_any_recipient: !d.allow_any_recipient }))} label="Allow any recipient" />
            </div>
            {draft.allow_any_recipient && (
              <p style={{ fontSize: '0.76rem', color: C.amber, background: C.amberWash, border: `1px solid ${C.amberLine}`, borderRadius: 6, padding: '0.55rem 0.75rem', margin: '0.8rem 0 0', lineHeight: 1.55 }}>
                With this on, an agent that is tricked by a message it reads could email anyone. Keep the daily limit low.
              </p>
            )}
          </section>

          <section>
            <SectionTitle>Limits and replies</SectionTitle>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem', color: C.soft }}>
                Daily limit (recipients per 24 hours)
                <input
                  type="number" min={MIN_DAILY_CAP} max={MAX_DAILY_CAP} value={draft.daily_cap}
                  onChange={e => setDraft(d => ({ ...d, daily_cap: Number(e.target.value) }))} style={{ ...inputStyle, width: 130 }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.78rem', color: C.soft, flex: '1 1 240px' }}>
                Replies go to
                <select value={draft.reply_to_mode} onChange={e => setDraft(d => ({ ...d, reply_to_mode: e.target.value as ReplyToMode }))} style={inputStyle}>
                  {(Object.keys(REPLY_TO_LABELS) as ReplyToMode[]).map(m => <option key={m} value={m}>{REPLY_TO_LABELS[m]}</option>)}
                </select>
              </label>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', padding: '0.85rem 1.4rem', borderTop: `1px solid ${C.lineSoft}`, background: C.paper }}>
          {confirmLeave ? (
            <>
              <span style={{ fontSize: '0.78rem', color: C.amber, flex: 1, minWidth: 160 }}>You have unsaved changes.</span>
              <Btn variant="ghost" onClick={() => setConfirmLeave(false)}>Keep editing</Btn>
              <Btn onClick={onClose}>Discard and close</Btn>
              <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
            </>
          ) : (
            <>
              <span style={{ fontSize: '0.78rem', color: message?.ok ? C.green : C.red, flex: 1, minWidth: 100 }}>{message?.text ?? ''}</span>
              {dirty && !saving && <Btn variant="ghost" onClick={() => { setDraft(base); setEntryError(''); setMessage(null); }}>Discard</Btn>}
              <Btn onClick={requestClose}>Close</Btn>
              <Btn variant="primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
