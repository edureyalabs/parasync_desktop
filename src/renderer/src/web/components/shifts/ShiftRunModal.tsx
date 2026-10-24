// components/shifts/ShiftRunModal.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RowChain from './RowChain';
import { clockTime, dayLabel, minutesLabel } from './format';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, RED, RED_BG, RED_LINE, SANS, SERIF, SOFT } from './tokens';
import type { Outcome, Shift, ShiftRow, ShiftRun } from './types';
import { useShiftRun, type ShiftRunData } from './useShiftRun';
import { useShiftRuns } from './useShifts';

// One shift run as a vertical chain: Start -> one node per scheduled wake -> End. The agent's marker
// sits on the rail and moves toward the next scheduled wake as time passes. Every wake is a
// horizontal chain of its own (RowChain); wakes the agent was pulled into early (by its cron, or by a
// failed step) are drawn between the scheduled nodes they happened after.

const RAIL = 34;
const SEGMENT_MIN_HEIGHT = 84;

const OUTCOME_STYLE: Record<Outcome, { fg: string; bg: string; label: string }> = {
  completed: { fg: GREEN, bg: GREEN_BG, label: 'Completed' },
  partial: { fg: BRASS, bg: BRASS_SOFT, label: 'Partial' },
  failed: { fg: RED, bg: RED_BG, label: 'Failed' },
};

function Bead({ tone, pulse = false, size = 14 }: { tone: 'done' | 'running' | 'upcoming' | 'failed' | 'start' | 'end'; pulse?: boolean; size?: number }) {
  const fill = { done: GREEN, running: BRASS, upcoming: '#fff', failed: RED, start: INK, end: INK }[tone];
  const border = { done: GREEN, running: BRASS, upcoming: '#C9C4B2', failed: RED, start: INK, end: INK }[tone];
  return (
    <span aria-hidden style={{ position: 'relative', display: 'block', width: size, height: size, borderRadius: tone === 'start' || tone === 'end' ? 3 : '50%', background: fill, border: `2px solid ${border}`, boxSizing: 'border-box', animation: pulse ? 'shPulse 1.6s ease-in-out infinite' : undefined }} />
  );
}

function beadTone(row: ShiftRow): 'done' | 'running' | 'upcoming' | 'failed' {
  if (row.status === 'running') return 'running';
  if (row.status === 'done') return 'done';
  if (row.status === 'failed') return 'failed';
  return 'upcoming';
}

export default function ShiftRunModal({ shift, initialRunId, onClose, onTerminate }: {
  shift: Shift;
  initialRunId: string;
  onClose: () => void;
  onTerminate: (shift: Shift) => void;
}) {
  const [runId, setRunId] = useState(initialRunId);
  const runs = useShiftRuns(shift.id);
  const data = useShiftRun(runId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  return <ShiftRunView shift={shift} runs={runs} runId={runId} data={data} now={now} onSelectRun={setRunId} onClose={onClose} onTerminate={onTerminate} />;
}

// The drawing itself: pure, driven entirely by props (so it can be previewed with fixture data).
export function ShiftRunView({ shift, runs, runId, data, now, onSelectRun, onClose, onTerminate }: {
  shift: Shift;
  runs: ShiftRun[];
  runId: string;
  data: ShiftRunData;
  now: number;
  onSelectRun: (id: string) => void;
  onClose: () => void;
  onTerminate: (shift: Shift) => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const run = data.run;
  const tz = run?.spec_snapshot.timezone ?? shift.spec?.timezone ?? 'UTC';
  const scheduled = useMemo(() => data.rows.filter(r => r.kind === 'scheduled').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)), [data.rows]);
  const extras = useMemo(() => data.rows.filter(r => r.kind !== 'scheduled'), [data.rows]);
  const active = run?.status === 'active';

  // Where the marker is: working at a node (a wake is running), or on the rail between two nodes.
  const working = data.rows.find(r => r.status === 'running') ?? null;
  const startMs = run ? new Date(run.window_start).getTime() : 0;
  const endMs = run ? new Date(run.window_end).getTime() : 0;
  const nextIdx = scheduled.findIndex(r => r.status === 'scheduled' && new Date(r.scheduled_for).getTime() > now - 1000);
  const segmentIdx = nextIdx === -1 ? scheduled.length : nextIdx;   // marker lives in the segment BEFORE this node
  const prevMs = segmentIdx === 0 ? startMs : new Date(scheduled[segmentIdx - 1].scheduled_for).getTime();
  const nextMs = segmentIdx >= scheduled.length ? endMs : new Date(scheduled[segmentIdx].scheduled_for).getTime();
  const fraction = Math.min(1, Math.max(0, nextMs > prevMs ? (now - prevMs) / (nextMs - prevMs) : 1));
  const activeCron = data.crons.find(c => c.status === 'active');

  const extrasAfter = (index: number): ShiftRow[] => {
    const lo = index < 0 ? -Infinity : new Date(scheduled[index].scheduled_for).getTime();
    const hi = index + 1 < scheduled.length ? new Date(scheduled[index + 1].scheduled_for).getTime() : Infinity;
    return extras.filter(r => { const t = new Date(r.scheduled_for).getTime(); return t >= lo && t < hi; });
  };

  const marker = active && run ? (
    working ? (
      <>Working on <strong>{working.label}</strong>…</>
    ) : (
      <>
        Asleep. {segmentIdx < scheduled.length ? <>Next scheduled wake <strong>{clockTime(scheduled[segmentIdx].scheduled_for, tz)}</strong> in {minutesLabel((nextMs - now) / 60000)}.</> : <>Waiting for the end of the shift in {minutesLabel((endMs - now) / 60000)}.</>}
        {activeCron && <> A cron checks every {activeCron.every_minutes} min ({activeCron.runs_done}/{activeCron.max_runs} done).</>}
      </>
    )
  ) : null;

  const segment = (index: number) => {
    const inThisSegment = active && !working && segmentIdx === index + 1;
    const mid = extrasAfter(index);
    const minHeight = inThisSegment || mid.length > 0 ? SEGMENT_MIN_HEIGHT : index === -1 ? 20 : 36;
    return (
      <div key={`seg-${index}`} style={{ display: 'grid', gridTemplateColumns: `${RAIL}px 1fr`, minHeight }}>
        <div style={{ position: 'relative' }}>
          {inThisSegment && (
            <span aria-hidden style={{ position: 'absolute', left: RAIL / 2 - 8, top: `calc(${(fraction * 100).toFixed(1)}% - 8px)`, width: 16, height: 16, background: BRASS, transform: 'rotate(45deg)', borderRadius: 2, boxShadow: '0 0 0 4px #EFE4C9', transition: 'top 0.6s ease' }} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.7rem 0 0.7rem 0.4rem' }}>
          {mid.map(r => (
            <div key={r.id} style={{ marginLeft: '1.1rem' }}><RowChain row={r} steps={data.steps} agentSteps={data.agentSteps} nodes={data.nodes} cron={data.crons.find(c => c.created_by_row_id === r.id)} ticks={data.ticks.filter(t => t.cron_id === data.crons.find(c => c.created_by_row_id === r.id)?.id)} timezone={tz} /></div>
          ))}
          {inThisSegment && marker && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#514726', background: BRASS_SOFT, border: '1px solid #E4D2A0', borderRadius: 6, padding: '0.5rem 0.75rem', lineHeight: 1.5 }}>
              <span style={{ fontFamily: MONO, fontSize: '0.64rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: BRASS, marginRight: '0.4rem' }}>The agent</span>{marker}
            </p>
          )}
        </div>
      </div>
    );
  };

  const nodeRow = (content: React.ReactNode, bead: React.ReactNode, key: string) => (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: `${RAIL}px 1fr`, alignItems: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '1rem', position: 'relative', zIndex: 1 }}>{bead}</div>
      <div style={{ paddingLeft: '0.4rem' }}>{content}</div>
    </div>
  );

  const finished = run && (run.status === 'ended' || run.status === 'terminated');
  const handoff = run?.handoff;

  return (
    <div
      ref={overlay}
      onClick={e => { if (e.target === overlay.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(10,10,10,0.38)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <style>{`
        @keyframes shPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(124,95,39,0.45); } 50% { box-shadow: 0 0 0 6px rgba(124,95,39,0); } }
        .sh-md { font-size: 0.85rem; line-height: 1.65; color: #1A190F; overflow-wrap: break-word; }
        .sh-md p { margin: 0 0 0.55rem; } .sh-md p:last-child { margin-bottom: 0; }
        .sh-md ul, .sh-md ol { margin: 0 0 0.55rem 1.15rem; padding: 0; } .sh-md ul { list-style: disc; } .sh-md ol { list-style: decimal; }
        .sh-md h1, .sh-md h2, .sh-md h3 { font-size: 0.92rem; font-weight: 500; margin: 0.8rem 0 0.3rem; }
        .sh-md table { border-collapse: collapse; font-size: 0.78rem; margin: 0.4rem 0; } .sh-md th, .sh-md td { border: 1px solid ${LINE}; padding: 0.25rem 0.5rem; text-align: left; }
        .sh-md code { font-family: ${MONO}; font-size: 0.78rem; background: #EDEBE2; padding: 0.08rem 0.3rem; border-radius: 3px; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>
      <div role="dialog" aria-modal="true" aria-label={`${shift.name} run`} style={{ background: '#F7F6F2', border: `1px solid ${LINE}`, borderRadius: 10, width: '100%', maxWidth: 980, height: 'min(92vh, 900px)', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
        <header style={{ padding: '1.1rem 1.4rem', borderBottom: `1px solid ${LINE}`, background: '#fff', display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontFamily: MONO, fontSize: '0.66rem', color: BRASS, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Shift run</p>
            <h2 style={{ fontFamily: SERIF, fontSize: '1.3rem', fontWeight: 500, letterSpacing: '-0.015em', color: '#514726', margin: '0.25rem 0 0' }}>{shift.name}</h2>
            <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {runs.slice(0, 10).map(r => (
                <button key={r.id} onClick={() => onSelectRun(r.id)} aria-pressed={r.id === runId}
                  style={{ fontFamily: MONO, fontSize: '0.68rem', padding: '0.22rem 0.55rem', borderRadius: 3, cursor: 'pointer', border: `1px solid ${r.id === runId ? INK : LINE}`, background: r.id === runId ? INK : '#fff', color: r.id === runId ? '#F7F6F2' : SOFT }}>
                  {dayLabel(r.run_date)}{r.status === 'active' ? ' · live' : ''}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {active && <button onClick={() => onTerminate(shift)} style={{ background: 'none', border: `1px solid ${RED_LINE}`, color: RED, padding: '0.4rem 0.85rem', fontSize: '0.78rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Terminate today&apos;s run</button>}
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: SOFT, padding: 4, lineHeight: 1 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1.4rem 1.6rem' }}>
          {data.loading || !run ? (
            <p style={{ fontSize: '0.85rem', color: MUTED }}>Loading the run…</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.3rem' }}>
                {[
                  { title: 'Notes for the next wake', body: handoff?.note, show: !!handoff?.note },
                  { title: `Open items (${handoff?.open_items?.length ?? 0})`, body: null, show: (handoff?.open_items?.length ?? 0) > 0 },
                  { title: 'Running report', body: run.running_report, show: !!run.running_report },
                ].filter(p => p.show).map(p => (
                  <details key={p.title} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, padding: '0.55rem 0.85rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: INK, fontWeight: 500 }}>{p.title}</summary>
                    {p.body ? <div className="sh-md" style={{ marginTop: '0.55rem' }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown></div> : (
                      <ul style={{ margin: '0.55rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {(handoff?.open_items ?? []).map(item => (
                          <li key={item.key} style={{ fontSize: '0.8rem', color: INK }}>
                            <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: BRASS }}>{item.key}</span> · {item.status}
                            {item.due && <span style={{ color: MUTED }}> · act again by {item.due}</span>}
                            {item.detail && <span style={{ color: SOFT }}> — {item.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                ))}
              </div>

              <div role="list" aria-label="Shift timeline" style={{ position: 'relative' }}>
                <span aria-hidden style={{ position: 'absolute', left: RAIL / 2 - 1, top: 24, bottom: 24, width: 2, background: LINE }} />
                {nodeRow(
                  <div style={{ padding: '0.55rem 0' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: INK }}>Shift starts · {clockTime(run.window_start, tz)}</span>
                    <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: MUTED, marginLeft: '0.6rem' }}>window ends {clockTime(run.window_end, tz)} ({tz})</span>
                  </div>,
                  <Bead tone="start" size={16} />, 'start',
                )}
                {segment(-1)}
                {scheduled.map((row, i) => (
                  <div key={row.id}>
                    {nodeRow(
                      <RowChain row={row} steps={data.steps} agentSteps={data.agentSteps} nodes={data.nodes} cron={data.crons.find(c => c.created_by_row_id === row.id)} ticks={data.ticks.filter(t => t.cron_id === data.crons.find(c => c.created_by_row_id === row.id)?.id)} timezone={tz} />,
                      <Bead tone={beadTone(row)} pulse={row.status === 'running'} />, row.id,
                    )}
                    {segment(i)}
                  </div>
                ))}
                {nodeRow(
                  <div style={{ padding: '0.55rem 0' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: INK }}>Shift ends · {clockTime(run.window_end, tz)}</span>
                    {finished && (
                      <span style={{ marginLeft: '0.6rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: MUTED }}>{run.status === 'terminated' ? 'terminated by the owner' : 'ended'} {clockTime(run.ended_at, tz)}</span>
                        {run.outcome && <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: OUTCOME_STYLE[run.outcome].fg, background: OUTCOME_STYLE[run.outcome].bg, borderRadius: 3, padding: '0.18rem 0.5rem' }}>{OUTCOME_STYLE[run.outcome].label}</span>}
                      </span>
                    )}
                  </div>,
                  <Bead tone="end" size={16} />, 'end',
                )}
              </div>

              {finished && (
                <section style={{ marginTop: '1.2rem', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '1.1rem 1.3rem' }}>
                  <p style={{ fontFamily: MONO, fontSize: '0.66rem', color: BRASS, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>Shift report</p>
                  {run.report ? (
                    <>
                      <p style={{ margin: '0 0 0.7rem', fontFamily: SERIF, fontSize: '1.1rem', color: '#514726' }}>{run.report.headline}</p>
                      <div className="sh-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{run.report.body}</ReactMarkdown></div>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: RED, lineHeight: 1.6 }}>{run.outcome_note ?? 'No report was submitted for this run.'}</p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

