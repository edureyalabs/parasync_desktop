// components/browser-jobs/BrowserJobCard.tsx
'use client';

import { useState } from 'react';
import { ChainRail } from '@/components/runsheet/ChainRail';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, RED, RED_BG, SANS, SOFT } from '@/components/projects/tokens';
import JobPanel from './JobPanel';
import { beadsFor, caption, elapsed, isLive, jobTitle } from './jobModel';
import type { AccessRef, BrowserJob, BrowserJobStep } from './types';

export const BROWSER_JOB_FG = '#3D5A6E';
export const BROWSER_JOB_BG = '#E3EAF0';

function Chip({ fg, bg, children }: { fg: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontFamily: MONO, fontSize: '0.63rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 3, color: fg, background: bg, whiteSpace: 'nowrap' }}>{children}</span>;
}

function statusChip(job: BrowserJob) {
  if (job.status === 'running') return <Chip fg={GREEN} bg={GREEN_BG}>Working</Chip>;
  if (job.status === 'queued') return <Chip fg={BRASS} bg={BRASS_SOFT}>{job.next_attempt_at && new Date(job.next_attempt_at).getTime() > Date.now() && job.attempts > 0 ? 'Will retry' : 'Queued'}</Chip>;
  if (job.status === 'awaiting_credentials') return <Chip fg={BRASS} bg={BRASS_SOFT}>Needs details</Chip>;
  if (job.status === 'failed') return job.error === 'cancelled' ? <Chip fg={MUTED} bg="#F0EEE5">Cancelled</Chip> : <Chip fg={RED} bg={RED_BG}>Failed</Chip>;
  return <Chip fg={GREEN} bg={GREEN_BG}>Done</Chip>;
}

const BTN: React.CSSProperties = { background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 };

// A Browser Access job in the Runsheet: a learning run, a tool search, a tool build, a setup or a login test. A thin bead rail of its steps and one
// line on where it is. The details open in the panel; a live job can be cancelled. Read-only: bemain writes everything.
export default function BrowserJobCard({ job, access, steps, onCancel, history = false }: {
  job: BrowserJob; access: AccessRef | undefined; steps: BrowserJobStep[]; onCancel: () => void; history?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const live = isLive(job);
  const failed = job.status === 'failed' && job.error !== 'cancelled';
  const accent = live ? BROWSER_JOB_FG : failed ? '#D9A196' : job.status === 'done' ? '#8DBA9A' : '#DAD5C5';
  const beads = beadsFor(steps, job.status === 'running');

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: '0.95rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: history ? '0.88rem' : '0.9rem', fontWeight: history ? 400 : 500, color: INK, margin: '0 0 0.4rem', lineHeight: 1.5 }}>{jobTitle(job, access)}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Chip fg={BROWSER_JOB_FG} bg={BROWSER_JOB_BG}>Browser</Chip>
            {statusChip(job)}
            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: MUTED }}>
              {live ? `started ${new Date(job.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : new Date(job.ended_at ?? job.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {elapsed(job)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0 }}>
          <button onClick={() => setOpen(true)} style={BTN}>Open</button>
          {live && <button onClick={onCancel} style={{ ...BTN, border: '1px solid #E3C4BB', color: RED }}>Cancel</button>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.8rem', minWidth: 0 }}>
        {beads.length > 0 && <ChainRail beads={beads} follow={live ? beads[beads.length - 1].id : null} ariaLabel={`${jobTitle(job, access)}, ${steps.length} steps`} />}
        <span style={{ fontSize: '0.74rem', color: failed ? RED : SOFT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caption(job, steps)}</span>
      </div>

      {open && <JobPanel job={job} access={access} steps={steps} onClose={() => setOpen(false)} onCancel={() => { setOpen(false); onCancel(); }} />}
    </div>
  );
}
