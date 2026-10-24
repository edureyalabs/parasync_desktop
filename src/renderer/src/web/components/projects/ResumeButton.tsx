// components/projects/ResumeButton.tsx
'use client';

import { useState } from 'react';
import { INK, MUTED, SANS } from './tokens';

// Reopens a project that failed or ran out of time (/api/projects/[id]/resume -> bemain). bemain checks it is the caller's and that its limits
// allow it, and says why in plain words when not. The same action as the button in the notification.
export default function ResumeButton({ projectId, onResumed, small = false }: { projectId: string; onResumed?: () => void; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resume = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/resume`, { method: 'POST' }).catch(() => null);
    const data = resp ? await resp.json().catch(() => null) : null;
    setBusy(false);
    if (!resp || !data?.ok) { setError(data?.error ?? 'Could not resume the project. Please try again.'); return; }
    onResumed?.();
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <button onClick={() => void resume()} disabled={busy}
        style={{ background: busy ? '#E2DFD3' : INK, color: busy ? MUTED : '#fff', border: 'none', borderRadius: 4, padding: small ? '0.3rem 0.65rem' : '0.4rem 0.9rem', fontSize: small ? '0.74rem' : '0.78rem', fontFamily: SANS, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
        {busy ? 'Resuming…' : 'Resume'}
      </button>
      {error && <span style={{ fontSize: '0.72rem', color: '#B34A3C' }}>{error}</span>}
    </span>
  );
}
