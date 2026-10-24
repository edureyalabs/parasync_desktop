// components/shifts/ShiftLearning.tsx
'use client';

// The shift's pre-run learning pass, live: whether it is running, how long since its last sign of life, and every look it has made at the
// tools and systems (with what it sent and what came back), so a pass that is slow or stuck can be told from one that is working.
import { useEffect, useState } from 'react';
import { ACCENT, INK, LINE, MUTED, PAPER, SOFT } from '@/components/runsheet/tokens';
import type { ArenaStep, Shift } from './types';
import { useArenaSteps } from './useArenaSteps';

const MONO = "'IBM Plex Mono', monospace";
const MAX_PASSES = 3;
const STALE_SECONDS = 150;       // the engine treats a pass silent this long as dead

function ago(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return 'never';
  const s = Math.max(Math.round((nowMs - new Date(iso).getTime()) / 1000), 0);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function clip(value: unknown, n: number): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 1);
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function StepRow({ step }: { step: ArenaStep }) {
  const [open, setOpen] = useState(false);
  if (step.kind === 'context') return null;
  const refused = step.kind === 'rejected';
  const failed = !step.ok;
  const mark = refused ? '⊘' : failed ? '✗' : '✓';
  const color = refused ? MUTED : failed ? '#B34A3C' : '#3D7A4F';
  const label = refused ? 'Refused call' : step.kind === 'look' ? 'Looked' : step.kind;
  return (
    <li style={{ fontSize: '0.76rem', lineHeight: 1.5, color: SOFT }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: '0.45rem', alignItems: 'baseline', width: '100%' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.7rem', color, width: 12, flex: 'none', textAlign: 'center' }}>{mark}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: MUTED, minWidth: 18 }}>{step.step_number}</span>
        <span style={{ color: INK }}>{label}: <span style={{ fontFamily: MONO, fontSize: '0.72rem' }}>{step.tool ?? '—'}</span></span>
        {!step.counted && !refused && <span style={{ color: MUTED, fontSize: '0.68rem' }}>(not counted)</span>}
      </button>
      {open && (
        <div style={{ margin: '0.25rem 0 0.4rem 2.2rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {step.arguments != null && <pre style={{ margin: 0, fontFamily: MONO, fontSize: '0.68rem', background: '#F7F6F2', border: `1px solid ${LINE}`, borderRadius: 4, padding: '0.4rem 0.55rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflowY: 'auto' }}>{clip(step.arguments, 900)}</pre>}
          {step.result != null && <pre style={{ margin: 0, fontFamily: MONO, fontSize: '0.68rem', background: failed || refused ? '#FBF1EE' : '#F7F6F2', border: `1px solid ${LINE}`, borderRadius: 4, padding: '0.4rem 0.55rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflowY: 'auto' }}>{clip(step.result, 900)}</pre>}
        </div>
      )}
    </li>
  );
}

export default function ShiftLearning({ shift }: { shift: Shift }) {
  const state = shift.arena_state;
  const live = state === 'running' || state === 'pending';
  const steps = useArenaSteps(shift.id, true, live);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(t);
  }, [live]);

  const visible = steps.filter(s => s.kind !== 'context');
  if (!state || (visible.length === 0 && !live)) return null;

  const passes = shift.arena_passes ?? 0;
  const last = steps.length ? steps[steps.length - 1].created_at : null;
  const beatMs = shift.arena_heartbeat_at ? new Date(shift.arena_heartbeat_at).getTime() : null;
  const quiet = state === 'running' && beatMs != null && (nowMs - beatMs) / 1000 > STALE_SECONDS;
  const counted = visible.filter(s => s.counted).length;
  const due = shift.next_start_at ? new Date(shift.next_start_at).getTime() <= nowMs : false;

  let headline: string;
  let color = '#A17F3A';
  if (state === 'running') headline = quiet ? 'The learning pass has gone quiet' : `Learning pass ${passes} of ${MAX_PASSES} is working`;
  else if (state === 'pending') headline = passes > 0 ? `Learning pass ${passes} did not finish; the next one is queued` : 'The learning pass is queued';
  else if (state === 'done') { headline = 'The learning pass finished'; color = '#3D7A4F'; }
  else { headline = 'The learning pass did not finish, so the first wake will continue it'; color = '#B34A3C'; }
  if (quiet) color = '#B34A3C';

  const shown = showAll ? visible : visible.slice(-8);

  return (
    <div style={{ marginTop: '0.6rem', background: PAPER, border: `1px solid ${LINE}`, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '0.7rem 0.85rem 0.8rem' }}>
      <p style={{ margin: 0, fontFamily: MONO, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: ACCENT.plan }}>Learning pass</p>
      <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', fontWeight: 500, color }}>{headline}</p>
      <p style={{ margin: '0.2rem 0 0', fontSize: '0.74rem', color: SOFT, lineHeight: 1.55 }}>
        {visible.length} step{visible.length === 1 ? '' : 's'} so far ({counted} counted, out of at most 50) · last step {ago(last, nowMs)}
        {state === 'running' ? ` · last sign of life ${ago(shift.arena_heartbeat_at, nowMs)}` : ''}
      </p>
      {state === 'running' && (
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.74rem', color: MUTED, lineHeight: 1.55 }}>
          The agent explores first and writes the SOP at the end, so nothing appears below until it does. A step can take a minute while it thinks.
          {due ? ' The shift’s window is open: its first wake starts the moment this pass finishes.' : ''}
        </p>
      )}
      {quiet && <p style={{ margin: '0.3rem 0 0', fontSize: '0.74rem', color: '#B34A3C' }}>No sign of life for over {Math.round(STALE_SECONDS / 60 * 10) / 10} minutes. If its process was restarted, the pass is retried automatically.</p>}
      {visible.length > 0 && (
        <ul style={{ margin: '0.55rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {shown.map(s => <StepRow key={s.id} step={s} />)}
        </ul>
      )}
      {visible.length > 8 && (
        <button onClick={() => setShowAll(a => !a)} style={{ background: 'none', border: 'none', padding: 0, marginTop: '0.4rem', color: SOFT, fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {showAll ? 'Show only the latest' : `Show all ${visible.length} steps`}
        </button>
      )}
    </div>
  );
}
