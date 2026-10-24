// components/notifications/ProjectResume.tsx
'use client';

import { useState } from 'react';
import type { AgentNotification } from './useNotifications';

// The Resume button under a "project stopped" entry. Pressing it asks bemain to reopen the project (/api/projects/[id]/resume), which
// checks it is the caller's, that it really stopped and that its limits allow it. Once resumed, the entry shows "Resumed" instead.

const INK = '#26251E';
const SOFT = '#67655A';
const MUTED = '#9E9C8F';
const LINE = '#E2DFD3';

export function ProjectResume({ item, onResumed }: { item: AgentNotification; onResumed: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (item.replied_at || done) {
    return (
      <div style={{ marginTop: '0.7rem', paddingTop: '0.6rem', borderTop: `1px solid ${LINE}` }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: MUTED, margin: 0 }}>Resumed</p>
      </div>
    );
  }
  if (!item.project_id) return null;

  const resume = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const resp = await fetch(`/api/projects/${encodeURIComponent(item.project_id as string)}/resume`, { method: 'POST' }).catch(() => null);
    const data = resp ? await resp.json().catch(() => null) : null;
    setBusy(false);
    if (!resp || !data?.ok) { setError(data?.error ?? 'Could not resume the project. Please try again.'); return; }
    setDone(true);
    void onResumed();
  };

  return (
    <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: `1px solid ${LINE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => void resume()} disabled={busy}
          style={{ background: busy ? '#E2DFD3' : INK, color: busy ? MUTED : '#fff', border: 'none', borderRadius: 5, padding: '0.4rem 0.95rem', fontSize: '0.78rem', fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer' }}
        >
          {busy ? 'Resuming…' : 'Resume project'}
        </button>
        <span style={{ fontSize: '0.74rem', color: SOFT }}>It carries on from its plan and notes, with a fresh window.</span>
        {error && <span style={{ fontSize: '0.74rem', color: '#B34A3C' }}>{error}</span>}
      </div>
    </div>
  );
}
