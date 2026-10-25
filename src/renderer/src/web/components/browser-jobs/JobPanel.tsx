// components/browser-jobs/JobPanel.tsx
'use client';

import { useState } from 'react';
import { ChainRail } from '@/components/runsheet/ChainRail';
import { INK, LINE, MONO, MUTED, RED, SANS, SOFT } from '@/components/projects/tokens';
import StepDetail from './StepDetail';
import { beadsFor, caption, elapsed, ghostFor, isLive, jobTitle } from './jobModel';
import type { AccessRef, BrowserJob, BrowserJobStep } from './types';

// One Browser Access job opened whole: the same bead rail, then the step the owner clicked (what it was given and what came back). Read-only.
export default function JobPanel({ job, access, steps, onClose, onCancel }: {
  job: BrowserJob; access: AccessRef | undefined; steps: BrowserJobStep[]; onClose: () => void; onCancel: () => void;
}) {
  const live = isLive(job);
  const [selected, setSelected] = useState<string | null>(steps.length ? steps[steps.length - 1].id : null);
  const step = steps.find(s => s.id === selected) ?? null;
  const beads = beadsFor(steps);
  const ghost = ghostFor(job);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
         style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div role="dialog" aria-modal="true" aria-label={jobTitle(job, access)}
           style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, width: '100%', maxWidth: 820, maxHeight: '88vh', overflowY: 'auto', padding: '1.4rem 1.5rem', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 500, letterSpacing: '-0.02em', color: INK, margin: '0 0 0.3rem' }}>{jobTitle(job, access)}</h2>
            <p style={{ fontFamily: MONO, fontSize: '0.68rem', color: MUTED, margin: 0 }}>
              {job.trigger === 'auto' ? 'started by itself' : 'started by you'} · {new Date(job.started_at).toLocaleString()} · {elapsed(job)}{job.attempts > 1 ? ` · attempt ${job.attempts}` : ''}
            </p>
          </div>
          {live && <button onClick={onCancel} style={{ background: 'none', border: '1px solid #E3C4BB', color: RED, padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Cancel</button>}
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Close</button>
        </div>
        <p style={{ fontSize: '0.8rem', color: job.status === 'failed' && job.error !== 'cancelled' ? RED : SOFT, margin: '0.8rem 0 0.9rem', lineHeight: 1.6 }}>{caption(job, steps)}</p>

        {beads.length > 0 || ghost
          ? <ChainRail beads={beads} ghost={ghost} selectedId={selected} onSelect={id => setSelected(cur => (cur === id ? null : id))} follow={ghost ? '__end__' : null} ariaLabel={`${jobTitle(job, access)}, ${steps.length} steps`} />
          : <p style={{ fontSize: '0.8rem', color: MUTED, margin: 0 }}>No steps yet.</p>}

        {step && <StepDetail step={step} />}
      </div>
    </div>
  );
}
