// components/shifts/ConfirmModal.tsx
'use client';

import { useRef, useState } from 'react';
import { BG, INK, LINE, MUTED, RED, RED_BG, RED_LINE, SANS, SOFT } from './tokens';

// A small confirm dialog for the two destructive shift actions (Terminate today's run, Retire the shift).
export default function ConfirmModal({ title, body, confirmLabel, keepLabel = 'Keep it', onConfirm, onClose }: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  keepLabel?: string;
  onConfirm: () => Promise<string | null>;   // returns an error message, or null on success
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overlay = useRef<HTMLDivElement>(null);

  const confirm = async () => {
    setBusy(true);
    setError('');
    const problem = await onConfirm();
    setBusy(false);
    if (problem) { setError(problem); return; }
    onClose();
  };

  return (
    <div
      ref={overlay}
      onClick={e => { if (e.target === overlay.current && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '1.6rem', width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 500, letterSpacing: '-0.02em', color: INK, margin: '0 0 0.6rem' }}>{title}</h2>
        <div style={{ fontSize: '0.85rem', color: SOFT, lineHeight: 1.6, margin: '0 0 1.4rem' }}>{body}</div>
        {error && <p style={{ fontSize: '0.8rem', color: RED, margin: '0 0 1rem', background: RED_BG, border: `1px solid ${RED_LINE}`, borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>{keepLabel}</button>
          <button onClick={confirm} disabled={busy} style={{ background: RED, color: BG, border: 'none', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: SANS, cursor: busy ? 'not-allowed' : 'pointer', borderRadius: 4, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
        <p style={{ margin: '0.9rem 0 0', fontSize: '0.7rem', color: MUTED }}>This can&apos;t be undone.</p>
      </div>
    </div>
  );
}
