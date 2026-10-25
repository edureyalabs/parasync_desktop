// components/browser-jobs/BrowserJobCard.tsx
'use client';

import { useState } from 'react';
import { ChainRail } from '@/components/runsheet/ChainRail';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, RED, RED_BG, SANS, SOFT } from '@/components/projects/tokens';
import JobPanel from './JobPanel';
import StepDetail from './StepDetail';
import { beadsFor, caption, elapsed, ghostFor, isLive, jobTitle } from './jobModel';
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

// A Browser Access job in the Runsheet: a learning run, a tool search, a tool build, a setup or a login test. The header carries the name, the chips and ONE
// status line that stays where it is (where the job is now, or how it ended); under it the rail of its steps. Click a step to see what the model wrote,
// what it was given and what came back, right under the rail like a task's nodes. The whole job opens in the panel; a live job can be cancelled.
export default function BrowserJobCard({ job, access, steps, onCancel, history = false }: {
  job: BrowserJob; access: AccessRef | undefined; steps: BrowserJobStep[]; onCancel: () => void; history?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const live = isLive(job);
  const failed = job.status === 'failed' && job.error !== 'cancelled';
  const accent = live ? BROWSER_JOB_FG : failed ? '#D9A196' : job.status === 'done' ? '#8DBA9A' : '#DAD5C5';
  const beads = beadsFor(steps);
  const ghost = ghostFor(job);
  const step = steps.find(s => s.id === selected) ?? null;
  const working = job.status === 'running';

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
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.76rem', color: failed ? RED : SOFT, margin: '0.45rem 0 0', minWidth: 0 }} aria-live="polite">
            {working && <span className="rs-anim" aria-hidden="true" style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: '#A17F3A', animation: 'rsBreathe 1.2s ease-in-out infinite' }} />}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caption(job, steps)}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0 }}>
          <button onClick={() => setOpen(true)} style={BTN}>Open</button>
          {live && <button onClick={onCancel} style={{ ...BTN, border: '1px solid #E3C4BB', color: RED }}>Cancel</button>}
        </div>
      </div>

      {(beads.length > 0 || ghost) && (
        <div style={{ marginTop: '0.7rem' }}>
          <ChainRail
            beads={beads} ghost={ghost} selectedId={selected} onSelect={id => setSelected(cur => (cur === id ? null : id))}
            follow={ghost ? '__end__' : null} ariaLabel={`${jobTitle(job, access)}, ${steps.length} steps`}
          />
          {!step && beads.length > 0 && <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: MUTED, margin: '0.25rem 0 0' }}>click a step to see what the model wrote and what came back</p>}
        </div>
      )}
      {step && <StepDetail step={step} />}

      {open && <JobPanel job={job} access={access} steps={steps} onClose={() => setOpen(false)} onCancel={() => { setOpen(false); onCancel(); }} />}
    </div>
  );
}
