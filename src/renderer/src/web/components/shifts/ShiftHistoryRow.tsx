// components/shifts/ShiftHistoryRow.tsx
'use client';

import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, RED, RED_BG, SANS, SHIFT_LINE, SOFT } from './tokens';
import { clockTime, dayLabel } from './format';
import ShiftBadge from './ShiftBadge';
import type { Outcome, Shift, ShiftRun } from './types';

const OUTCOME: Record<Outcome, { fg: string; bg: string; label: string; accent: string }> = {
  completed: { fg: GREEN, bg: GREEN_BG, label: 'Completed', accent: '#8DBA9A' },
  partial: { fg: BRASS, bg: BRASS_SOFT, label: 'Partial', accent: '#C9A24D' },
  failed: { fg: RED, bg: RED_BG, label: 'Failed', accent: '#D9A196' },
};

function Chip({ fg, bg, children }: { fg: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontFamily: MONO, fontSize: '0.63rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 3, color: fg, background: bg, whiteSpace: 'nowrap' }}>{children}</span>;
}

// One finished shift run in the Runsheet's History, in the same card shape as a finished task run.
export default function ShiftHistoryRow({ run, shift, onOpen }: { run: ShiftRun; shift: Shift | null; onOpen: () => void }) {
  const tz = run.spec_snapshot?.timezone ?? shift?.spec?.timezone ?? 'UTC';
  const outcome = run.outcome ? OUTCOME[run.outcome] : null;
  const headline = run.report?.headline ?? run.outcome_note ?? (run.status === 'terminated' ? 'Terminated by the owner.' : 'Ended without a report.');
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${outcome?.accent ?? '#DAD5C5'}`, boxShadow: `inset 0 2px 0 ${SHIFT_LINE}`, borderRadius: 6, padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '0.88rem', color: INK, margin: '0 0 0.35rem', lineHeight: 1.55 }}>{shift?.name ?? 'Shift'}</p>
          <p style={{ fontSize: '0.8rem', color: SOFT, margin: '0 0 0.5rem', lineHeight: 1.55 }}>{headline}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <ShiftBadge />
            {outcome ? <Chip fg={outcome.fg} bg={outcome.bg}>{outcome.label}</Chip> : <Chip fg={MUTED} bg="#F0EEE5">{run.status === 'terminated' ? 'Terminated' : 'Ended'}</Chip>}
            {run.status === 'ended' && !run.report_submitted && <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: RED }}>no report</span>}
            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: '#9E9C8F' }}>{dayLabel(run.run_date)} · {clockTime(run.window_start, tz)}–{clockTime(run.window_end, tz)}</span>
          </div>
        </div>
        <button onClick={onOpen} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4, flexShrink: 0 }}>
          Open run
        </button>
      </div>
    </div>
  );
}
