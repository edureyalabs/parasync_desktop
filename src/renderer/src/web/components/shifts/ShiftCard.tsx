// components/shifts/ShiftCard.tsx
'use client';

import { useState } from 'react';

import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, RED, RED_BG, RED_LINE, SANS, SHIFT_LINE, SOFT } from './tokens';
import { clockTime, dayAndTime, windowSummary } from './format';
import ShiftBadge from './ShiftBadge';
import ShiftChainBlock from './ShiftChainBlock';
import type { Shift, ShiftRun } from './types';

function Chip({ fg, bg, children }: { fg: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontFamily: MONO, fontSize: '0.64rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.16rem 0.5rem', borderRadius: 3, color: fg, background: bg, whiteSpace: 'nowrap' }}>{children}</span>;
}

const ghost: React.CSSProperties = { background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 };
const danger: React.CSSProperties = { ...ghost, border: `1px solid ${RED_LINE}`, color: RED };

export default function ShiftCard({ shift, activeRun, onView, onTerminate, onRetire, onReplan }: {
  shift: Shift;
  activeRun: ShiftRun | null;
  onView: (runId: string) => void;
  onTerminate: () => void;
  onRetire: () => void;
  onReplan: () => void;
}) {
  const spec = shift.spec;
  const tz = spec?.timezone ?? 'UTC';
  const planning = shift.status === 'pending' || shift.status === 'planning';
  const [open, setOpen] = useState(false);
  const accent = shift.status === 'failed' ? RED : activeRun ? GREEN : planning ? BRASS : '#C9C4B2';

  return (
    <article style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`, borderTop: `2px solid ${SHIFT_LINE}`, borderRadius: 8, padding: '1rem 1.15rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: INK, letterSpacing: '-0.01em' }}>{shift.name}</h3>
            <ShiftBadge />
            {activeRun && <Chip fg={GREEN} bg={GREEN_BG}>Running now</Chip>}
            {planning && <Chip fg={BRASS} bg={BRASS_SOFT}>Planning</Chip>}
            {!planning && shift.status === 'planned' && shift.sop_status === 'learning' && (shift.arena_state === 'running' || shift.arena_state === 'pending') && <Chip fg={BRASS} bg={BRASS_SOFT}>Learning pass {shift.arena_state === 'running' ? 'running' : 'queued'}</Chip>}
            {shift.status === 'failed' && <Chip fg={RED} bg={RED_BG}>Not planned</Chip>}
          </div>
          {spec && (
            <p style={{ margin: '0.35rem 0 0', fontFamily: MONO, fontSize: '0.7rem', color: MUTED }}>
              {windowSummary(spec)} · {tz}
            </p>
          )}
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: SOFT, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {spec?.goal ?? shift.definition}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0, flexWrap: 'wrap' }}>
          {activeRun && <button style={{ ...ghost, background: '#26251E', color: '#F7F6F2', border: 'none' }} onClick={() => onView(activeRun.id)}>View live run</button>}
          {activeRun && <button style={danger} onClick={onTerminate}>Terminate</button>}
          {shift.status === 'failed' && <button style={ghost} onClick={onReplan}>Plan again</button>}
          <button style={danger} onClick={onRetire}>Retire</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: activeRun ? GREEN : MUTED }}>
          {shift.status === 'planned' && spec
            ? (activeRun ? `Open until ${clockTime(activeRun.window_end, tz)}` : `Next run ${dayAndTime(shift.next_start_at, tz)}`)
            : ''}
        </span>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: SANS, fontSize: '0.72rem', color: SOFT, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          {open ? 'Collapse' : 'Details'}
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}>
            <path d="M2 1l4.5 3.5L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div>
          <ShiftChainBlock shift={shift} activeRun={activeRun} onViewRun={onView} />

          {spec?.assumptions && spec.assumptions.length > 0 && (
            <div style={{ margin: '0.75rem 0 0', background: '#F3EDDA', border: '1px solid #E4D2A0', borderRadius: 4, padding: '0.5rem 0.7rem' }}>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: '0.62rem', color: BRASS, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Worth a look</p>
              <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem', fontSize: '0.78rem', color: '#514726', lineHeight: 1.55, listStyle: 'disc' }}>
                {spec.assumptions.map(a => <li key={a}>{a}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
