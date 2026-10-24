// components/projects/ProjectRuns.tsx
'use client';

import { useState } from 'react';
import { when } from './format';
import { eventWords, type NowStatus } from './projectStatus';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, RED, RED_BG, SOFT } from './tokens';
import type { ProjectWake } from './types';

// "What is it doing right now" (a banner) and the wakes it has had (one row each: why it woke, how it ended, and, when a wake failed,
// the calls that were refused). Read-only.

const LABEL: React.CSSProperties = { fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: MUTED, margin: '0 0 0.45rem' };
const TONE: Record<NowStatus['tone'], { fg: string; bg: string; dot: string }> = {
  working: { fg: GREEN, bg: GREEN_BG, dot: '#5E9A70' },
  waiting: { fg: SOFT, bg: '#F0EEE5', dot: '#B9B4A0' },
  warn: { fg: BRASS, bg: BRASS_SOFT, dot: '#C9A24D' },
  stopped: { fg: RED, bg: RED_BG, dot: '#D9A196' },
};

export function NowBanner({ status, action }: { status: NowStatus; action?: React.ReactNode }) {
  const t = TONE[status.tone];
  return (
    <div style={{ background: t.bg, borderRadius: 6, padding: '0.65rem 0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.7rem' }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: t.dot, marginTop: 5, flex: 'none' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 500, color: t.fg, lineHeight: 1.5 }}>{status.headline}</p>
        {status.detail && <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: t.fg, lineHeight: 1.55, opacity: 0.9, overflowWrap: 'anywhere' }}>{status.detail}</p>}
      </div>
      {action}
    </div>
  );
}

function took(w: ProjectWake): string {
  if (!w.ended_at) return 'running';
  const s = Math.max(Math.round((new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 1000), 0);
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}

function chip(w: ProjectWake): { label: string; fg: string; bg: string } {
  if (w.status === 'running') return { label: 'Working', fg: GREEN, bg: GREEN_BG };
  if (w.status === 'failed') return w.error?.startsWith('interrupted') ? { label: 'Cut off by a restart', fg: BRASS, bg: BRASS_SOFT } : { label: 'Failed', fg: RED, bg: RED_BG };
  return { label: w.terminator === 'finish' ? 'Finished the project' : w.terminator === 'fail' ? 'Gave up' : w.terminator === 'wait' ? 'Went to sleep' : 'Done', fg: GREEN, bg: GREEN_BG };
}

function WakeRow({ wake }: { wake: ProjectWake }) {
  const [open, setOpen] = useState(false);
  const c = chip(wake);
  const calls = wake.failed_calls ?? [];
  const detail = Boolean(wake.error) || calls.length > 0;
  return (
    <div style={{ borderLeft: `1.5px solid ${LINE}`, marginLeft: 5, paddingLeft: '0.85rem', paddingBottom: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: INK }}>Wake {wake.wake_no}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: 3, color: c.fg, background: c.bg }}>{c.label}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: MUTED }}>{when(wake.started_at)} · {took(wake)}{wake.iterations_used != null ? ` · ${wake.iterations_used} step${wake.iterations_used === 1 ? '' : 's'}` : ''}</span>
      </div>
      <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: SOFT }}>
        {wake.reason?.final ? 'Final wake. ' : ''}Woken by {eventWords(wake.reason?.events)}.
      </p>
      {detail && (
        <>
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ background: 'none', border: 'none', padding: 0, marginTop: '0.2rem', color: SOFT, fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            {open ? 'Hide what went wrong' : `What went wrong${calls.length ? ` (${calls.length} refused call${calls.length === 1 ? '' : 's'})` : ''}`}
          </button>
          {open && (
            <div style={{ marginTop: '0.35rem' }}>
              {wake.error && <p style={{ margin: '0 0 0.3rem', fontSize: '0.76rem', color: RED, lineHeight: 1.55, overflowWrap: 'anywhere' }}>{wake.error}</p>}
              {calls.length > 0 && (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {calls.map((f, i) => (
                    <li key={i} style={{ fontSize: '0.74rem', color: SOFT, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                      <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: INK }}>{f.tool}</span> — {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WakeList({ wakes }: { wakes: ProjectWake[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? wakes : wakes.slice(0, 5);
  return (
    <section>
      <p style={LABEL}>Runs</p>
      {wakes.length === 0 ? <p style={{ fontSize: '0.78rem', color: MUTED, margin: 0 }}>It has not woken yet.</p> : (
        <>
          {shown.map(w => <WakeRow key={w.id} wake={w} />)}
          {wakes.length > 5 && (
            <button onClick={() => setAll(a => !a)} style={{ background: 'none', border: 'none', padding: 0, color: SOFT, fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {all ? 'Show only the latest' : `Show all ${wakes.length} wakes`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
