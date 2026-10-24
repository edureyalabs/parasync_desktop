// components/shifts/ShiftChainBlock.tsx
'use client';

// The bead rail on a shift card, the way a task card has one. Always visible: the rail and a one-line
// caption. Expanded: three tabs --
//   Day      the shift's day as beads (Start, each scheduled wake, End), coloured by the live run when one
//            is open; click a bead for its note, and for a wake that has run, what it decided
//   Plan     what the planner decided: goal, brief, report instructions, wake times, tool notes, assumptions
//   SOP      what the shift's agent has learnt and written for itself (versions, and whether it is learning or working)
//   Planner  what the planner did, step by step (and why a plan was sent back or could not be made)
import { useState } from 'react';
import { ChainRail } from '@/components/runsheet/ChainRail';
import { RunsheetStyles } from '@/components/runsheet/RunsheetStyles';
import { ACCENT, INK, LINE, MUTED, PAPER, SOFT, STATE_STYLE, stateChip } from '@/components/runsheet/tokens';
import { END_ID, START_ID, dayRail, plannerRail, revisionFailed, shiftCaption, type CaptionTone } from './chainModel';
import { daysLabel, minutesLabel } from './format';
import { MAX_REQUEST_CHARS, removePlanRequest, replanShift, requestPlanChanges } from './planActions';
import type { PlannerStep, Shift, ShiftRow, ShiftRun } from './types';
import DayTimeline from './DayTimeline';
import ShiftSop from './ShiftSop';
import { usePlannerSteps } from './usePlannerSteps';
import { useShiftRun, type ShiftRunData } from './useShiftRun';

const MONO = "'IBM Plex Mono', monospace";
const CAPTION_COLOR: Record<CaptionTone, string> = { neutral: SOFT, live: '#A17F3A', good: '#3D7A4F', bad: '#B34A3C' };
type Tab = 'day' | 'plan' | 'sop' | 'planner';

function Tabs({ tab, setTab, hasPlan }: { tab: Tab; setTab: (t: Tab) => void; hasPlan: boolean }) {
  const items: [Tab, string, boolean][] = [['day', 'Day', hasPlan], ['plan', 'Plan', hasPlan], ['sop', 'SOP', hasPlan], ['planner', 'Planner', true]];
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 2, background: '#F0EEE5', borderRadius: 999, padding: 2 }}>
      {items.filter(([, , show]) => show).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
          style={{ border: 'none', cursor: 'pointer', padding: '0.18rem 0.65rem', borderRadius: 999, fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.05em', textTransform: 'uppercase', background: tab === id ? INK : 'transparent', color: tab === id ? '#F7F6F2' : SOFT }}>
          {label}
        </button>
      ))}
    </div>
  );
}

const panel: React.CSSProperties = { marginTop: '0.6rem', background: PAPER, border: `1px solid ${LINE}`, borderLeft: `3px solid ${ACCENT.plan}`, borderRadius: 6, padding: '0.7rem 0.85rem 0.8rem', animation: 'rsSlide .18s ease-out' };
const tag: React.CSSProperties = { fontFamily: MONO, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: ACCENT.plan };
const para: React.CSSProperties = { fontSize: '0.8rem', color: SOFT, margin: '0.4rem 0 0', lineHeight: 1.55 };

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '0.65rem' }}>
      <p style={{ margin: 0, fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>{label}</p>
      <div style={{ marginTop: '0.25rem' }}>{children}</div>
    </div>
  );
}

const pre: React.CSSProperties = { margin: 0, fontFamily: MONO, fontSize: '0.74rem', color: INK, background: '#F7F6F2', border: `1px solid ${LINE}`, borderRadius: 4, padding: '0.5rem 0.65rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' };

// ── planner step detail ──────────────────────────────────────────────────────

function WakeList({ wakes }: { wakes: { time: string; note?: string }[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {wakes.map((w, i) => (
        <li key={`${w.time}-${i}`} style={{ fontSize: '0.78rem', color: INK }}>
          <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: ACCENT.agent }}>{w.time}</span>
          {w.note ? <span style={{ color: SOFT }}> — {w.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function PlannerStepDetail({ step }: { step: PlannerStep }) {
  const d = (step.detail ?? {}) as Record<string, unknown>;
  const plan = (step.outcome === 'plan_rejected' ? d.plan : step.outcome === 'plan_accepted' ? d : null) as
    { start_time?: string; end_time?: string; wakes?: { time: string; note?: string }[]; goal?: string; wake_source?: string } | null;
  const chip = stateChip(step.status === 'running' ? 'running' : step.status === 'completed' ? 'completed' : step.outcome === 'plan_rejected' ? 'recovering' : 'failed');
  return (
    <div style={panel}>
      <RunsheetStyles />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={tag}>{step.step_type === 'context' ? 'Context' : step.outcome === 'explored' ? 'Tried out' : 'Planner turn'}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: INK }}>{step.title}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.58rem', textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: 3, color: chip.fg, background: chip.bg, border: `1px solid ${chip.border}` }}>
          {step.status === 'running' ? 'Working' : step.outcome === 'plan_rejected' ? 'Sent back' : step.status === 'completed' ? 'Done' : 'Problem'}
        </span>
      </div>

      {step.step_type === 'context' && (
        <>
          <p style={para}>The planner was given {(d.tools as unknown[] | undefined)?.length ?? 0} tools, {String(d.instructions ?? 0)} organization instruction{d.instructions === 1 ? '' : 's'}, and the timezone {String(d.timezone ?? '')}.</p>
          <Block label="Tools it can write about">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {((d.tools as { name: string; read_only: boolean }[] | undefined) ?? []).map(t => (
                <span key={t.name} title={t.read_only ? 'Marked safe for exploration (read-only)' : 'Used only inside scheduled work'} style={{ fontFamily: MONO, fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: 3, border: `1px solid ${LINE}`, color: t.read_only ? '#3D7A4F' : SOFT, background: '#fff' }}>
                  {t.name}{t.read_only ? ' · read-only' : ''}
                </span>
              ))}
            </div>
          </Block>
        </>
      )}

      {step.status === 'running' && <p style={{ ...para, color: '#A17F3A' }}>Working on it…</p>}
      {step.outcome === 'explored' && (
        <>
          <p style={para}>The planner ran <b>{String(d.tool ?? '')}</b> to check something before committing to a plan{d.ok === false ? ', and it did not work' : ''}.</p>
          {d.arguments != null && <Block label="What it ran"><pre style={pre}>{JSON.stringify(d.arguments, null, 2)}</pre></Block>}
          {typeof d.result === 'string' && <Block label="What came back"><pre style={{ ...pre, color: d.ok === false ? '#B34A3C' : INK }}>{d.result}</pre></Block>}
        </>
      )}
      {step.outcome === 'no_tool_call' && <><p style={para}>{d.finish === 'length' ? 'The model ran out of output budget before answering' : d.said ? 'The model answered in plain text instead of submitting a plan' : 'The model returned nothing'}{typeof d.reasoning_tokens === 'number' ? ` (it spent ${d.reasoning_tokens} tokens thinking)` : ''}. It was reminded and asked again.</p>{typeof d.said === 'string' && <Block label="What it said"><pre style={pre}>{d.said}</pre></Block>}</>}
      {step.outcome === 'shift_rejected' && <Block label="Why it could not plan this shift"><pre style={{ ...pre, color: '#B34A3C' }}>{String(d.reason ?? '')}</pre></Block>}
      {step.outcome === 'llm_failed' && <Block label="Error"><pre style={{ ...pre, color: '#B34A3C' }}>{String(d.error ?? '')}</pre></Block>}
      {step.outcome === 'unknown_tool' && <p style={para}>The model called “{String(d.tool)}”, which is not one of the planner’s two actions.</p>}
      {step.outcome === 'plan_rejected' && Array.isArray(d.errors) && (
        <Block label="Why the plan was sent back">
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: '#B34A3C', lineHeight: 1.55, listStyle: 'disc' }}>{(d.errors as string[]).map(e => <li key={e}>{e}</li>)}</ul>
        </Block>
      )}
      {plan && (
        <>
          {plan.start_time && <Block label="Window"><span style={{ fontFamily: MONO, fontSize: '0.78rem', color: INK }}>{plan.start_time}–{plan.end_time}</span><span style={{ fontSize: '0.72rem', color: MUTED }}> · wake times {plan.wake_source === 'user' ? 'from the definition' : 'chosen by the planner'}</span></Block>}
          {plan.wakes && <Block label="Scheduled wakes"><WakeList wakes={plan.wakes} /></Block>}
          {plan.goal && <Block label="Goal"><p style={{ margin: 0, fontSize: '0.8rem', color: INK, lineHeight: 1.55 }}>{plan.goal}</p></Block>}
        </>
      )}
    </div>
  );
}

// ── the day ──────────────────────────────────────────────────────────────────

function DayBeadDetail({ shift, id, run, rows, onViewRun }: { shift: Shift; id: string; run: ShiftRun | null; rows: ShiftRow[]; onViewRun: (runId: string) => void }) {
  const spec = shift.spec!;
  const tz = spec.timezone;
  const scheduled = rows.filter(r => r.kind === 'scheduled').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const isWake = id.startsWith('wake-');
  const index = isWake ? Number(id.slice(5)) : -1;
  const wake = isWake ? spec.wakes[index] : null;
  const row = isWake ? scheduled[index] : undefined;
  const final = isWake && index === spec.wakes.length - 1;
  const title = id === START_ID ? 'Shift starts' : id === END_ID ? 'Shift ends' : final ? 'Closing wake' : 'Scheduled wake';

  return (
    <div style={{ ...panel, borderLeftColor: isWake ? ACCENT.agent : ACCENT.plan }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ ...tag, color: isWake ? ACCENT.agent : ACCENT.plan }}>{title}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: INK }}>{id === START_ID ? spec.start_time : id === END_ID ? spec.end_time : wake?.time}</span>
        {row && <span style={{ fontFamily: MONO, fontSize: '0.58rem', textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: 3, color: stateChip(row.status === 'done' ? 'completed' : row.status === 'scheduled' ? 'queued' : row.status === 'running' ? 'running' : row.status === 'failed' ? 'failed' : 'skipped').fg, background: '#F0EEE5' }}>{STATE_STYLE[row.status === 'done' ? 'completed' : row.status === 'scheduled' ? 'queued' : row.status === 'running' ? 'running' : row.status === 'failed' ? 'failed' : 'skipped'].label}</span>}
      </div>
      {id === START_ID && <p style={para}>The run opens at {spec.start_time} ({tz}) on {daysLabel(spec.days).toLowerCase()}. The first wake happens at once.</p>}
      {id === END_ID && <p style={para}>The shift closes at {spec.end_time} ({tz}) whatever is happening: a hard cap. A report that was not submitted by then is recorded as such.</p>}
      {isWake && (
        <>
          <p style={para}>{wake?.note ? <>This wake is for: {wake.note}</> : 'No specific purpose was set for this wake; the agent follows the brief.'}</p>
          <Block label="What happens in each wake">
            <p style={{ margin: 0, fontFamily: MONO, fontSize: '0.72rem', color: SOFT, lineHeight: 1.7 }}>
              wake → the agent reads the handoff and what changed → looks things up or computes (code_executor, read-only tools) → stages a work chain (tool / model / if-else steps) → ends the turn: finish, set a cron, or submit the report
            </p>
          </Block>
          {final && <p style={para}>This is the closing wake: the agent finishes what it can and must end with the shift report.</p>}
          {row?.decision?.why && <Block label="What the agent decided"><p style={{ margin: 0, fontSize: '0.8rem', color: INK, lineHeight: 1.55 }}>{row.decision.why}</p></Block>}
          {row?.error && <Block label="Problem"><pre style={{ ...pre, color: '#B34A3C' }}>{row.error}</pre></Block>}
        </>
      )}
      {run && (
        <button onClick={() => onViewRun(run.id)} style={{ marginTop: '0.7rem', background: 'none', border: `1px solid #DAD5C5`, color: '#3A3830', padding: '0.28rem 0.65rem', fontSize: '0.74rem', borderRadius: 4, cursor: 'pointer' }}>
          Open the full run
        </button>
      )}
    </div>
  );
}

function RequestList({ shift, requests, onRemove }: { shift: Shift; requests: NonNullable<Shift['plan_feedback']>; onRemove?: (shift: Shift, requestId: string) => Promise<string | null> }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {requests.map(r => (
          <li key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', color: INK, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.text}</span>
            <span style={{ fontFamily: MONO, fontSize: '0.58rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: r.applied_at ? '#3D7A4F' : '#A17F3A', whiteSpace: 'nowrap', paddingTop: 3 }}>{r.applied_at ? 'In the plan' : 'Waiting'}</span>
            {onRemove && (
              <button onClick={() => { void (async () => { setError(await onRemove(shift, r.id)); })(); }} aria-label="Remove this request" title="Remove: stops applying from the next time the shift is planned"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '0.9rem', lineHeight: 1, padding: '0 2px' }}>×</button>
            )}
          </li>
        ))}
      </ul>
      {error && <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#B34A3C' }}>{error}</p>}
    </div>
  );
}

function PlanTab({ shift, onRemoveRequest }: { shift: Shift; onRemoveRequest?: (shift: Shift, requestId: string) => Promise<string | null> }) {
  const spec = shift.spec;
  const requests = shift.plan_feedback ?? [];
  if (!spec) return <p style={{ ...para, marginTop: '0.8rem' }}>The plan appears here once planning has finished.</p>;
  const window = (() => { const [a, b] = [spec.start_time, spec.end_time].map(t => t.split(':').map(Number)); const m = (b[0] * 60 + b[1] - (a[0] * 60 + a[1]) + 1440) % 1440 || 1440; return minutesLabel(m); })();
  return (
    <div style={panel}>
      <span style={tag}>The plan</span>
      <p style={para}>{spec.start_time}–{spec.end_time} ({window}) · {daysLabel(spec.days).toLowerCase()} · {spec.timezone} · wake times {spec.wake_source === 'user' ? 'from your definition' : 'chosen by the planner'}.</p>
      <Block label="Goal"><p style={{ margin: 0, fontSize: '0.82rem', color: INK, lineHeight: 1.6 }}>{spec.goal}</p></Block>
      <Block label="How the agent works (the brief)"><pre style={{ ...pre, fontFamily: "'Inter', sans-serif", fontSize: '0.78rem', maxHeight: 280 }}>{spec.brief}</pre></Block>
      <Block label="Scheduled wakes"><WakeList wakes={spec.wakes} /></Block>
      <Block label="The final report must contain"><p style={{ margin: 0, fontSize: '0.8rem', color: INK, lineHeight: 1.55 }}>{spec.report_instructions}</p></Block>
      {requests.length > 0 && <Block label="Changes you asked for"><RequestList shift={shift} requests={requests} onRemove={onRemoveRequest} /></Block>}
      {(spec.tool_notes?.length ?? 0) > 0 && (
        <Block label="Tools and how they are used">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {spec.tool_notes!.map(n => <li key={n.tool} style={{ fontSize: '0.78rem', color: SOFT }}><span style={{ fontFamily: MONO, fontSize: '0.72rem', color: ACCENT.tool }}>{n.tool}</span> — {n.use}</li>)}
          </ul>
        </Block>
      )}
    </div>
  );
}

// ── the block ────────────────────────────────────────────────────────────────

export default function ShiftChainBlock({ shift, activeRun, onViewRun }: { shift: Shift; activeRun: ShiftRun | null; onViewRun: (runId: string) => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const planner = usePlannerSteps(shift.id, true, chosen);
  const data = useShiftRun(activeRun?.id ?? null);
  return (
    <ShiftChainView
      shift={shift} activeRun={activeRun ? data.run ?? activeRun : null} rows={data.rows} plannerSteps={planner.steps}
      runData={data} attempts={planner.attempts} attempt={planner.attempt} onPickAttempt={setChosen} onViewRun={onViewRun}
      onReplan={replanShift} onRequestChanges={requestPlanChanges} onRemoveRequest={removePlanRequest}
    />
  );
}

// The drawing: pure, driven by props (so it can be previewed with fixture data).
export function ShiftChainView({ shift, activeRun, rows, plannerSteps, runData, attempts = [], attempt = 0, onPickAttempt, onReplan, onRequestChanges, onRemoveRequest, onViewRun, initialTab, initialExpanded, initialSelected }: {
  shift: Shift;
  activeRun: ShiftRun | null;
  rows: ShiftRow[];
  plannerSteps: PlannerStep[];
  runData?: ShiftRunData;
  attempts?: number[];
  attempt?: number;
  onPickAttempt?: (attempt: number) => void;
  onReplan?: (shiftId: string) => Promise<string | null>;
  onRequestChanges?: (shift: Shift, text: string) => Promise<string | null>;
  onRemoveRequest?: (shift: Shift, requestId: string) => Promise<string | null>;
  onViewRun: (runId: string) => void;
  initialTab?: Tab;
  initialExpanded?: boolean;
  initialSelected?: string;
}) {
  const planning = shift.status === 'pending' || shift.status === 'planning';
  const hasPlan = shift.spec != null;
  const [expanded, setExpanded] = useState(initialExpanded ?? (planning || shift.status === 'failed' || shift.status === 'planned'));
  const [replanError, setReplanError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const canReplan = !!onReplan && (shift.status === 'planned' || shift.status === 'failed') && activeRun?.status !== 'active';
  const [tab, setTab] = useState<Tab>(initialTab ?? (hasPlan ? 'day' : 'planner'));
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);

  const activeTab: Tab = !hasPlan ? 'planner' : tab;
  const showPlanner = activeTab === 'planner';
  const planner = plannerRail(plannerSteps, shift);
  const day = dayRail(shift, activeRun, rows);
  const caption = shiftCaption(shift, activeRun, rows, plannerSteps);
  const beads = showPlanner ? planner.beads : day.beads;
  const selectedStep = showPlanner ? plannerSteps.find(s => s.id === selected) : undefined;

  const onSelect = (id: string) => {
    setSelected(cur => (cur === id ? null : id));
    if (!expanded) setExpanded(true);
  };

  if (!hasPlan && plannerSteps.length === 0 && !planning) {
    return <p style={{ margin: '0.75rem 0 0', fontSize: '0.74rem', color: MUTED }}>No planning steps were recorded for this shift.</p>;
  }

  return (
    <div style={{ marginTop: '0.8rem', borderTop: `1px solid ${LINE}`, paddingTop: '0.65rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
        <span style={{ fontSize: '0.74rem', color: CAPTION_COLOR[caption.tone], flex: 1, minWidth: 0 }}>{caption.text}</span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded} style={{ background: 'none', border: 'none', color: SOFT, fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {expanded ? 'Collapse' : 'Details'}
        </button>
      </div>

      {expanded && hasPlan && <div style={{ margin: '0.35rem 0 0.2rem' }}><Tabs tab={activeTab} setTab={t => { setTab(t); setSelected(null); }} hasPlan={hasPlan} /></div>}

      {expanded && showPlanner && attempts.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', margin: '0.3rem 0' }}>
          <span style={{ fontFamily: MONO, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>Attempt</span>
          {attempts.map(a => (
            <button key={a} onClick={() => { onPickAttempt?.(a); setSelected(null); }} aria-pressed={a === attempt}
              style={{ border: `1px solid ${LINE}`, cursor: 'pointer', padding: '0.1rem 0.5rem', borderRadius: 999, fontFamily: MONO, fontSize: '0.64rem', background: a === attempt ? INK : '#fff', color: a === attempt ? '#F7F6F2' : SOFT }}>
              {a}{a === attempts[attempts.length - 1] ? ' · latest' : ''}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'day' && expanded && runData && hasPlan && <DayTimeline shift={shift} run={activeRun} data={runData} />}

      {activeTab !== 'plan' && activeTab !== 'sop' && !(activeTab === 'day' && expanded && runData) && (
        <ChainRail
          beads={beads} ghost={showPlanner ? planner.ghost : null} selectedId={selected} onSelect={onSelect}
          follow={showPlanner ? planner.follow : day.follow} ariaLabel={showPlanner ? `${shift.name}: planner steps` : `${shift.name}: the day`}
        />
      )}

      {expanded && activeTab === 'plan' && <PlanTab shift={shift} onRemoveRequest={canReplan ? onRemoveRequest : undefined} />}
      {expanded && activeTab === 'sop' && <ShiftSop shift={shift} />}
      {expanded && canReplan && (
        <div style={{ marginTop: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {onRequestChanges && hasPlan && !composing && (
              <button onClick={() => { setComposing(true); setReplanError(null); }}
                style={{ background: INK, border: `1px solid ${INK}`, color: '#F7F6F2', padding: '0.28rem 0.65rem', fontSize: '0.74rem', borderRadius: 4, cursor: 'pointer' }}>
                Request changes
              </button>
            )}
            <button onClick={() => { void (async () => { setReplanError(await onReplan!(shift.id)); })(); }}
              style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.28rem 0.65rem', fontSize: '0.74rem', borderRadius: 4, cursor: 'pointer' }}>
              Plan again
            </button>
            {!composing && <span style={{ fontSize: '0.7rem', color: MUTED }}>Changes revise this plan; Plan again starts over from the definition (your earlier requests still apply). Either takes effect from the next run.</span>}
            {replanError && <span style={{ fontSize: '0.72rem', color: '#B34A3C' }}>{replanError}</span>}
          </div>
          {composing && onRequestChanges && (
            <div style={{ marginTop: '0.55rem', background: PAPER, border: `1px solid ${LINE}`, borderRadius: 6, padding: '0.6rem 0.7rem' }}>
              <label htmlFor={`req-${shift.id}`} style={{ display: 'block', fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.35rem' }}>What should change?</label>
              <textarea
                id={`req-${shift.id}`} value={draft} rows={3} maxLength={MAX_REQUEST_CHARS} autoFocus disabled={sending}
                onChange={e => { setDraft(e.target.value); setReplanError(null); }}
                placeholder="e.g. Check inventory again just before the closing wake, and keep the report to five lines."
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: "'Inter', sans-serif", fontSize: '0.8rem', lineHeight: 1.55, color: INK, background: '#fff', border: '1px solid #DAD5C5', borderRadius: 4, padding: '0.45rem 0.55rem', outline: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                <button disabled={sending || !draft.trim()}
                  onClick={() => { void (async () => {
                    setSending(true);
                    const err = await onRequestChanges(shift, draft);
                    setSending(false);
                    setReplanError(err);
                    if (!err) { setComposing(false); setDraft(''); }
                  })(); }}
                  style={{ background: INK, border: `1px solid ${INK}`, color: '#F7F6F2', padding: '0.28rem 0.75rem', fontSize: '0.74rem', borderRadius: 4, cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? 0.55 : 1 }}>
                  {sending ? 'Sending…' : 'Send to the planner'}
                </button>
                <button disabled={sending} onClick={() => { setComposing(false); setDraft(''); setReplanError(null); }}
                  style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.28rem 0.65rem', fontSize: '0.74rem', borderRadius: 4, cursor: 'pointer' }}>
                  Cancel
                </button>
                <span style={{ fontSize: '0.68rem', color: MUTED }}>The planner revises the current plan with this. If it can’t, the current plan stays in force.</span>
              </div>
            </div>
          )}
        </div>
      )}
      {expanded && showPlanner && selectedStep && <PlannerStepDetail step={selectedStep} />}
      {expanded && showPlanner && !selectedStep && planner.beads.length === 0 && <p style={para}>The planner has not recorded any steps yet.</p>}
      {expanded && shift.status === 'planned' && revisionFailed(shift) && shift.last_error && (
        <p style={{ ...para, color: '#B34A3C' }}>{shift.last_error}</p>
      )}
      {expanded && showPlanner && shift.status === 'failed' && shift.last_error && (
        <p style={{ ...para, color: '#B34A3C' }}>{shift.last_error}</p>
      )}
      {expanded && !showPlanner && activeTab === 'day' && !runData && selected && hasPlan && (
        <DayBeadDetail shift={shift} id={selected} run={activeRun} rows={rows} onViewRun={onViewRun} />
      )}
      {expanded && !showPlanner && activeTab === 'day' && !runData && !selected && <p style={para}>Select a point on the rail to see what happens there.</p>}
    </div>
  );
}
