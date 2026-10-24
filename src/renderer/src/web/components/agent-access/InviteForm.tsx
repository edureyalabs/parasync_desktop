// components/agent-access/InviteForm.tsx
'use client';

import { useState } from 'react';
import { Btn, Card, CardTitle, Spinner } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { copyText } from '@/components/agent-ui/clipboard';

// Invite by email (private agents). Sending creates the invite and shows its code once, prominently, because the code
// is the thing the owner has to hand over by hand. It can always be copied again from the list below.

export function InviteForm({ onSend }: { onSend: (email: string) => Promise<{ code: string; email: string } | { error: string }> }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ code: string; email: string } | null>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);

  const send = async () => {
    setSending(true); setError(''); setSent(null); setCopied(null);
    const out = await onSend(email);
    setSending(false);
    if ('error' in out) { setError(out.error); return; }
    setSent(out);
    setEmail('');
  };

  const copy = async () => {
    if (!sent) return;
    setCopied((await copyText(sent.code)) ? 'yes' : 'no');
    setTimeout(() => setCopied(null), 2200);
  };

  return (
    <Card pad="1rem 1.4rem">
      <CardTitle>Invite someone</CardTitle>
      <p style={{ fontSize: '0.78rem', color: C.soft, margin: '-0.3rem 0 0.8rem', lineHeight: 1.55, maxWidth: 560 }}>
        They see a pending invite under Requests. You send them the code yourself; it is never shown to them on the platform.
      </p>
      <form onSubmit={e => { e.preventDefault(); if (email.trim() && !sending) void send(); }} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <input
          type="email" value={email} aria-label="Email address to invite" autoComplete="off"
          onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder="teammate@company.com"
          style={{ flex: '1 1 260px', minWidth: 0, padding: '0.6rem 0.8rem', fontSize: '0.86rem', fontFamily: "'Inter', sans-serif", color: C.ink, background: '#fff', border: `1px solid #DAD5C5`, borderRadius: 6, outline: 'none' }}
        />
        <Btn type="submit" variant="primary" disabled={sending || !email.trim()}>
          {sending && <Spinner size={14} color="#fff" />}
          {sending ? 'Creating…' : 'Create invite'}
        </Btn>
      </form>
      {error && <p role="alert" style={{ fontSize: '0.78rem', color: C.red, margin: '0.7rem 0 0', lineHeight: 1.5 }}>{error}</p>}

      {sent && (
        <div style={{ marginTop: '1.1rem', background: C.greenWash, border: `1px solid ${C.greenLine}`, borderRadius: 8, padding: '1rem 1.15rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.76rem', color: C.green, margin: '0 0 0.35rem' }}>Invite created for <strong style={{ fontWeight: 500 }}>{sent.email}</strong>. Send them this code:</p>
            <span style={{ fontFamily: MONO, fontSize: '1.5rem', letterSpacing: '0.22em', color: C.ink, fontWeight: 500 }}>{sent.code}</span>
          </div>
          <Btn variant="outline" onClick={() => void copy()} style={{ background: '#fff' }}>
            {copied === 'yes' ? 'Copied ✓' : copied === 'no' ? 'Select and copy it' : 'Copy code'}
          </Btn>
        </div>
      )}
    </Card>
  );
}
