// components/shifts/DayTimeline.tsx
'use client';

// The shift's day as a vertical line, like a git history: Start at the top, each wake a commit on the
// main line, End at the bottom. A wake that has happened branches to the right into its own horizontal
// view (planning phase, then execution phase), so what the agent did inside it reads left to right
// while the day reads top to bottom. Wakes the agent was pulled into early (cron, failed step) hang off
// the line between the scheduled wakes they fall between.
import { useMemo } from 'react';
import { BRASS, GREEN, INK, LINE, MONO, MUTED, RED, SOFT } from './tokens';
import RowChain from './RowChain';
import type { ShiftRunData } from './useShiftRun';
import type { Shift, ShiftRow, ShiftRun } from './types';

const RAIL = 28;
const COLOR: Record<string, string> = { done: GREEN, failed: RED, running: BRASS, skipped: MUTED, scheduled: LINE };

function Dot({ color, size = 12, ring }: { color: string; size?: number; ring?: boolean }) {
  return <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: ring ? '#F7F6F2' : color, border: `2px solid ${color}`, display: 'block', boxSizing: 'border-box' }} />;
}

function Node({ dot, children, last }: { dot: React.ReactNode; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${RAIL}px 1fr`, minWidth: 0 }}>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        {!last && <span aria-hidden style={{ position: 'absolute', top: 18, bottom: -4, width: 2, background: LINE }} />}
        <span style={{ position: 'relative', zIndex: 1 }}>{dot}</span>
      </div>
      <div style={{ paddingBottom: '0.9rem', minWidth: 0 }}>{children}</div>
    </div>
  );
}

export default function DayTimeline({ shift, run, data }: { shift: Shift; run: ShiftRun | null; data: ShiftRunData }) {
  const spec = shift.spec;
  const tz = run?.spec_snapshot.timezone ?? spec?.timezone ?? 'UTC';
  const scheduled = useMemo(() => data.rows.filter(r => r.kind === 'scheduled').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)), [data.rows]);
  const extras = useMemo(() => data.rows.filter(r => r.kind !== 'scheduled'), [data.rows]);
  if (!spec) return null;
  const wakes = run?.spec_snapshot.wakes ?? spec.wakes;

  const extrasAfter = (index: number): ShiftRow[] => {
    const lo = new Date(scheduled[index]?.scheduled_for ?? 0).getTime();
    const hi = scheduled[index + 1] ? new Date(scheduled[index + 1].scheduled_for).getTime() : Infinity;
    return extras.filter(r => { const t = new Date(r.scheduled_for).getTime(); return t >= lo && t < hi; });
  };
  const chain = (r: ShiftRow) => {
    const cron = data.crons.find(c => c.created_by_row_id === r.id);
    return <RowChain row={r} steps={data.steps} agentSteps={data.agentSteps} nodes={data.nodes} cron={cron} ticks={data.ticks.filter(t => t.cron_id === cron?.id)} timezone={tz} />;
  };
  const label = (text: string) => <p style={{ margin: 0, fontFamily: MONO, fontSize: '0.72rem', color: INK }}>{text}</p>;

  return (
    <div style={{ marginTop: '0.4rem' }}>
      <Node dot={<Dot color={run ? GREEN : LINE} />}>
        {label(`${spec.start_time} · Shift starts`)}
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: SOFT }}>{run ? 'The run is open.' : `Opens at ${spec.start_time} (${tz}).`}</p>
      </Node>

      {wakes.map((w, i) => {
        const row = scheduled[i];
        const state = row?.status ?? 'scheduled';
        const final = i === wakes.length - 1;
        return (
          <div key={`${w.time}-${i}`}>
            <Node dot={<Dot color={COLOR[state] ?? LINE} ring={state === 'scheduled'} size={final ? 14 : 12} />}>
              {row && row.status !== 'scheduled' ? chain(row) : (
                <>
                  {label(`${w.time} · ${final ? 'Closing wake' : i === 0 ? 'Opening wake' : 'Backup nudge'}`)}
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: SOFT, lineHeight: 1.5 }}>{w.note || 'No specific purpose; the agent follows the brief.'}</p>
                </>
              )}
            </Node>
            {extrasAfter(i).map(r => (
              <Node key={r.id} dot={<span style={{ marginLeft: 8 }}><Dot color={COLOR[r.status] ?? LINE} size={9} /></span>}>{chain(r)}</Node>
            ))}
          </div>
        );
      })}

      <Node dot={<Dot color={run && run.status !== 'active' ? GREEN : LINE} ring={!run || run.status === 'active'} />} last>
        {label(`${spec.end_time} · Shift ends`)}
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: SOFT }}>A hard cap: whatever is running stops here.</p>
      </Node>
    </div>
  );
}
