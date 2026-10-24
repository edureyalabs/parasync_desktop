// components/notifications/QuestionReply.tsx
'use client';

import { useState } from 'react';
import type { AgentNotification } from './useNotifications';

// The answer box under a project agent's question. Unanswered: a text area and a button. Answered: what was said.
// The answer goes to /api/projects/reply (which checks the question is the caller's and still open) and wakes the project.

const INK = '#26251E';
const SOFT = '#67655A';
const MUTED = '#9E9C8F';
const LINE = '#E2DFD3';
const MAX_CHARS = 2000;

export function QuestionReply({ item, onAnswered }: { item: AgentNotification; onAnswered: () => Promise<void> | void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const answered = item.replied_at ? (item.reply_text ?? '') : sent;
  if (answered !== null && answered !== undefined) {
    return (
      <div style={{ marginTop: '0.7rem', paddingTop: '0.6rem', borderTop: `1px solid ${LINE}` }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: MUTED, margin: '0 0 0.25rem' }}>You answered</p>
        <p style={{ fontSize: '0.82rem', color: SOFT, lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{answered}</p>
      </div>
    );
  }

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    const resp = await fetch('/api/projects/reply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: item.id, text: value }),
    }).catch(() => null);
    const data = resp ? await resp.json().catch(() => null) : null;
    setBusy(false);
    if (!resp || !data?.ok) { setError(data?.error ?? 'Could not send your answer. Please try again.'); return; }
    setSent(value);
    void onAnswered();
  };

  return (
    <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: `1px solid ${LINE}` }}>
      <label htmlFor={`answer-${item.id}`} style={{ display: 'block', fontSize: '0.74rem', color: SOFT, marginBottom: '0.35rem' }}>Your answer</label>
      <textarea
        id={`answer-${item.id}`} value={text} onChange={e => setText(e.target.value.slice(0, MAX_CHARS))} rows={2} disabled={busy}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit(); }}
        placeholder="Type your answer…"
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 56, padding: '0.55rem 0.7rem', fontSize: '0.84rem', fontFamily: "'Inter', sans-serif", color: INK, background: '#fff', border: '1px solid #DAD5C5', borderRadius: 6, outline: 'none', lineHeight: 1.5 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '0.45rem' }}>
        <button
          onClick={() => void submit()} disabled={busy || !text.trim()}
          style={{ background: busy || !text.trim() ? '#E2DFD3' : INK, color: busy || !text.trim() ? MUTED : '#fff', border: 'none', borderRadius: 5, padding: '0.4rem 0.95rem', fontSize: '0.78rem', fontWeight: 500, cursor: busy || !text.trim() ? 'not-allowed' : 'pointer' }}
        >
          {busy ? 'Sending…' : 'Send answer'}
        </button>
        {error && <span style={{ fontSize: '0.74rem', color: '#B34A3C' }}>{error}</span>}
      </div>
    </div>
  );
}
