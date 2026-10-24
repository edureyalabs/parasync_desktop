// components/runsheet/PlannerView.tsx
'use client';

// Every pass the planner agent has made for a task -- planning (building the chain node by
// node) and repair (fixing the step a run stopped at) -- as ONE continuous dot-and-line rail: the
// passes follow each other left to right, each starting with a small label (Plan, Repair, Repair 2).
// One bead per planner turn: a tool's own picture for a node it added, a magnifier for an exploration
// call, swap/minus/flag for replace / delete / finish. Click a bead to open just that turn: what the
// model wrote, the arguments, and the result or error. A compact line per pass sits under the rail
// with its totals, its plan / diagnosis and why it stopped.
import { useEffect, useId, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toolIcon, toolIconIfKnown, type ToolIconSpec } from '@/components/icons/toolIcons';
import { ChainRail, type RailBead } from './ChainRail';
import { CodeBlock } from './CodeBlock';
import { formatDuration, prettyJson } from './chainModel';
import { RunsheetStyles } from './RunsheetStyles';
import { ACCENT, LINE, MUTED, PAPER, SOFT, stateChip, STATE_STYLE, type BeadState, type GlyphKey } from './tokens';

type PlannerStatus = 'running' | 'completed' | 'failed';

interface PlannerRun {
  id: string;
  kind: string;
  status: PlannerStatus;
  iterations_used: number;
  tool_calls_total: number;
  tool_calls_failed: number;
  exit_reason: string | null;
  error: string | null;
  plan: string | null;
  started_at: string;
  ended_at: string | null;
}

interface PlannerStep {
  id: string;
  run_id: string;
  step_number: number;
  step_type: 'llm_call' | 'tool_call';
  title: string | null;
  status: PlannerStatus;
  input_excerpt: string | null;
  output_excerpt: string | null;
  error: string | null;
  started_at: string;
  ended_at: string | null;
}

const RUN_COLUMNS = 'id, kind, status, iterations_used, tool_calls_total, tool_calls_failed, exit_reason, error, plan, started_at, ended_at';
const STEP_COLUMNS = 'id, run_id, step_number, step_type, title, status, input_excerpt, output_excerpt, error, started_at, ended_at';

const CHAIN_OPS = new Set(['add_node', 'replace_node', 'delete_last_node', 'finish_chain']);

function upsert<T extends { id: string }>(list: T[], row: T, sort: (a: T, b: T) => number): T[] {
  return (list.some(r => r.id === row.id) ? list.map(r => (r.id === row.id ? row : r)) : [...list, row]).sort(sort);
}

function parseArgs(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ─── turns ──────────────────────────────────────────────────────────────────

/** One planner turn = the model call and the tool call it made. */
interface Turn {
  id: string;
  tool: PlannerStep | null;
  llm: PlannerStep | null;
}

/** Pairs each tool call with the model call right before it. A model call with no tool call
 *  after it (a failed or unparseable turn, or one still thinking) stands alone. */
function pairTurns(steps: PlannerStep[]): Turn[] {
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
  const turns: Turn[] = [];
  let pending: PlannerStep | null = null;
  for (const step of sorted) {
    if (step.step_type === 'llm_call') {
      if (pending) turns.push({ id: pending.id, tool: null, llm: pending });
      pending = step;
    } else {
      turns.push({ id: step.id, tool: step, llm: pending });
      pending = null;
    }
  }
  if (pending) turns.push({ id: pending.id, tool: null, llm: pending });
  return turns;
}

/** A model turn that wrote its <plan> and stopped before the tool call (the planner stores it as `[plan] …`). */
function isPlanTurn(llm: PlannerStep): boolean {
  return (llm.output_excerpt ?? '').startsWith('[plan]');
}

function turnBead(turn: Turn): RailBead {
  const tool = turn.tool;
  if (!tool) {
    const llm = turn.llm!;
    if (llm.status === 'running') return { id: turn.id, label: 'thinking', glyph: 'think', state: 'running', title: 'Model turn' };
    if (llm.status === 'failed') return { id: turn.id, label: 'model', glyph: 'think', state: 'failed', title: `Model call failed: ${llm.error ?? ''}` };
    // The model answered: a finished step, not a failed or stale one. A plan written ahead of its
    // first tool call is accepted as a step of its own.
    const duration = formatDuration(llm.started_at, llm.ended_at);
    if (isPlanTurn(llm)) return { id: turn.id, label: 'plan', glyph: 'plan', state: 'completed', sublabel: duration ?? undefined, title: 'Plan written' };
    return { id: turn.id, label: 'reply', glyph: 'think', state: 'completed', sublabel: duration ?? 'no call', title: 'Model reply (no tool call)' };
  }
  const title = tool.title ?? 'tool';
  const args = parseArgs(tool.input_excerpt);
  const state: BeadState = title.includes('not executed') ? 'skipped' : tool.status === 'running' ? 'running' : tool.status === 'failed' ? 'failed' : 'completed';
  const rejected = tool.status === 'failed' && CHAIN_OPS.has(title);

  let glyph: GlyphKey = 'explore';
  let label = title;
  let icon: ToolIconSpec | undefined = toolIconIfKnown(title) ?? undefined;
  if (title.includes('not executed')) { glyph = 'think'; label = title.includes('plan') ? 'no plan' : 'limit'; }
  else if (title === 'add_node') {
    const key = typeof args.output_key === 'string' ? args.output_key : 'node';
    label = key;
    glyph = args.tool_name === 'submit_to_chat' || args.tool_name === 'push_notification' ? 'deliver' : args.node_type === 'llm_direct' ? 'llm' : args.node_type === 'llm_agentic' ? 'agent' : 'add';
    icon = typeof args.tool_name === 'string' && args.tool_name ? toolIcon(args.tool_name) : undefined;
  } else if (title === 'replace_node') { glyph = 'replace'; label = `step ${String(args.step_number ?? '?')}`; }
  else if (title === 'delete_last_node') { glyph = 'remove'; label = 'delete'; }
  else if (title === 'finish_chain') { glyph = 'finish'; label = 'finish'; }
  else if (title.startsWith('submit_chain')) { glyph = 'add'; label = 'submit'; }

  const duration = formatDuration(tool.started_at, tool.ended_at);
  return {
    id: turn.id, label, glyph, icon, state,
    sublabel: rejected ? 'rejected' : duration ?? undefined,
    title: `${title}${rejected ? ' (rejected)' : ''}${duration ? ` · ${duration}` : ''}`,
  };
}

function kindTag(turn: Turn): { text: string; glyph: GlyphKey } {
  const title = turn.tool?.title ?? '';
  if (!turn.tool) return turn.llm && isPlanTurn(turn.llm) ? { text: 'Plan', glyph: 'plan' } : { text: 'Model', glyph: 'think' };
  if (CHAIN_OPS.has(title) || title.startsWith('submit_chain')) return { text: 'Chain', glyph: title === 'add_node' ? 'add' : 'replace' };
  return { text: 'Explore', glyph: 'explore' };
}

function TurnDetail({ turn, state }: { turn: Turn; state: BeadState }) {
  const tag = kindTag(turn);
  const chip = stateChip(state);
  const wrote = (turn.llm?.output_excerpt ?? '').replace(/^\[[a-z_]+\]\s*/, '').trim();
  const step = turn.tool ?? turn.llm;
  return (
    <div style={{ marginTop: '0.55rem', background: PAPER, border: `1px solid ${LINE}`, borderLeft: `3px solid ${ACCENT[tag.glyph]}`, borderRadius: 6, padding: '0.65rem 0.8rem 0.75rem', animation: 'rsSlide .18s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: ACCENT[tag.glyph] }}>{tag.text}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.76rem', color: '#26251E' }}>{turn.tool?.title ?? (turn.llm && isPlanTurn(turn.llm) ? 'Plan written' : 'Model reply')}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: 3, color: chip.fg, background: chip.bg, border: `1px ${STATE_STYLE[state].dashed ? 'dashed' : 'solid'} ${chip.border}` }}>
          {state === 'skipped' ? 'Not executed' : STATE_STYLE[state].label}
        </span>
        {step && formatDuration(step.started_at, step.ended_at) && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: MUTED }}>{formatDuration(step.started_at, step.ended_at)}</span>}
      </div>
      {wrote && <CodeBlock label="Model wrote" text={wrote} maxHeight={180} />}
      {turn.tool?.input_excerpt && <CodeBlock label={CHAIN_OPS.has(turn.tool.title ?? '') ? 'Node' : 'Arguments'} text={prettyJson(turn.tool.input_excerpt)} />}
      {turn.tool?.output_excerpt && <CodeBlock label="Result" text={prettyJson(turn.tool.output_excerpt)} />}
      {(turn.tool?.error ?? (turn.llm?.status === 'failed' ? turn.llm.error : null)) && (
        <CodeBlock label="Error" text={(turn.tool?.error ?? turn.llm?.error) as string} tone="error" />
      )}
    </div>
  );
}

// ─── one pass, as a summary line ────────────────────────────────────────────

function PassStatusChip({ status }: { status: PlannerStatus }) {
  const state: BeadState = status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'completed';
  const chip = stateChip(state);
  return (
    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: 3, color: chip.fg, background: chip.bg, border: `1px solid ${chip.border}` }}>
      {STATE_STYLE[state].label}
    </span>
  );
}

function PassLine({ run, label }: { run: PlannerRun; label: string }) {
  const [showPlan, setShowPlan] = useState(false);
  const duration = formatDuration(run.started_at, run.ended_at);
  const planTitle = run.kind === 'repair' ? 'Diagnosis & fix approach' : 'Plan';
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, padding: '0.45rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.76rem', color: '#26251E', fontWeight: 500 }}>{label} pass</span>
        <PassStatusChip status={run.status} />
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: MUTED }}>
          {run.iterations_used} turn{run.iterations_used === 1 ? '' : 's'} · {run.tool_calls_total} call{run.tool_calls_total === 1 ? '' : 's'}
          {run.tool_calls_failed > 0 ? ` (${run.tool_calls_failed} failed)` : ''}{duration ? ` · ${duration}` : ''}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: '#B9B4A2' }}>{new Date(run.started_at).toLocaleString()}</span>
        {run.plan && (
          <button type="button" onClick={() => setShowPlan(v => !v)} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: SOFT }}>
            {showPlan ? '▾' : '▸'} {planTitle}
          </button>
        )}
      </div>
      {showPlan && run.plan && <CodeBlock label={planTitle} text={run.plan} maxHeight={160} />}
      {run.status === 'failed' && (run.error || run.exit_reason) && (
        <CodeBlock label="Why it stopped" text={[run.exit_reason, run.error].filter(Boolean).join('\n')} tone="error" />
      )}
    </div>
  );
}

function passLabel(run: PlannerRun, runs: PlannerRun[]): string {
  const same = runs.filter(r => r.kind === run.kind);
  const base = run.kind === 'repair' ? 'Repair' : run.kind === 'plan' ? 'Plan' : run.kind;
  return same.length > 1 ? `${base} ${same.indexOf(run) + 1}` : base;
}

// ─── all passes of a task ───────────────────────────────────────────────────

export function PlannerView({ taskId, live }: { taskId: string; live: boolean }) {
  const uid = useId();
  const [runsState, setRunsState] = useState<{ taskId: string; runs: PlannerRun[] } | null>(null);
  const [stepsState, setStepsState] = useState<{ key: string; byRun: Record<string, PlannerStep[]> } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const byStart = (a: PlannerRun, b: PlannerRun) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
    (async () => {
      const { data } = await supabase.from('task_planner_runs').select(RUN_COLUMNS).eq('task_id', taskId).order('started_at');
      if (cancelled) return;
      const fetched = (data as PlannerRun[]) ?? [];
      setRunsState(prev => {
        const map = new Map(fetched.map(r => [r.id, r]));
        if (prev?.taskId === taskId) for (const r of prev.runs) map.set(r.id, r);
        return { taskId, runs: Array.from(map.values()).sort(byStart) };
      });
    })();
    if (!live) return () => { cancelled = true; };
    const channel = supabase
      .channel(`rs-planner-runs:${taskId}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_planner_runs', filter: `task_id=eq.${taskId}` }, payload => {
        if (cancelled || payload.eventType === 'DELETE') return;
        setRunsState(prev => ({ taskId, runs: upsert(prev?.taskId === taskId ? prev.runs : [], payload.new as PlannerRun, byStart) }));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [taskId, live, uid]);

  const runs = useMemo(() => (runsState?.taskId === taskId ? runsState.runs : null), [runsState, taskId]);
  const runKey = runs ? runs.map(r => r.id).join(',') : '';
  const runningKey = runs ? runs.filter(r => r.status === 'running').map(r => r.id).join(',') : '';

  // One load of every pass's steps (a pass added later changes runKey and loads again), then a live channel per pass that is still running.
  useEffect(() => {
    if (!runKey) return;
    const supabase = createClient();
    let cancelled = false;
    const bySt = (a: PlannerStep, b: PlannerStep) => a.step_number - b.step_number;
    (async () => {
      const { data } = await supabase.from('task_planner_run_steps').select(STEP_COLUMNS).in('run_id', runKey.split(',')).order('step_number');
      if (cancelled) return;
      const grouped: Record<string, PlannerStep[]> = {};
      for (const row of (data as PlannerStep[]) ?? []) (grouped[row.run_id] ??= []).push(row);
      setStepsState(prev => {
        const byRun: Record<string, PlannerStep[]> = { ...(prev?.byRun ?? {}) };
        for (const id of runKey.split(',')) {
          const map = new Map((grouped[id] ?? []).map(r => [r.id, r]));
          for (const r of byRun[id] ?? []) map.set(r.id, r);      // a live update that arrived first is newer than the fetch
          byRun[id] = Array.from(map.values()).sort(bySt);
        }
        return { key: runKey, byRun };
      });
    })();
    return () => { cancelled = true; };
  }, [runKey]);

  useEffect(() => {
    if (!live || !runningKey) return;
    const supabase = createClient();
    let cancelled = false;
    const bySt = (a: PlannerStep, b: PlannerStep) => a.step_number - b.step_number;
    const channels = runningKey.split(',').map(runId => supabase
      .channel(`rs-planner-steps:${runId}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_planner_run_steps', filter: `run_id=eq.${runId}` }, payload => {
        if (cancelled || payload.eventType === 'DELETE') return;
        setStepsState(prev => ({ key: prev?.key ?? '', byRun: { ...(prev?.byRun ?? {}), [runId]: upsert(prev?.byRun[runId] ?? [], payload.new as PlannerStep, bySt) } }));
      })
      .subscribe());
    return () => { cancelled = true; channels.forEach(c => supabase.removeChannel(c)); };
  }, [runningKey, live, uid]);

  const model = useMemo(() => {
    const beads: RailBead[] = [];
    const turnsById = new Map<string, Turn>();
    for (const run of runs ?? []) {
      const turns = pairTurns(stepsState?.byRun[run.id] ?? []);
      const tone: 'plan' | 'repair' | 'neutral' = run.kind === 'repair' ? 'repair' : run.kind === 'plan' ? 'plan' : 'neutral';
      turns.forEach((turn, i) => {
        const bead = turnBead(turn);
        beads.push(i === 0 ? { ...bead, section: { label: passLabel(run, runs ?? []), tone } } : bead);
        turnsById.set(turn.id, turn);
      });
    }
    return { beads, turnsById };
  }, [runs, stepsState]);

  if (runs === null) return <p style={{ fontSize: '0.76rem', color: MUTED, margin: '0.5rem 0', fontStyle: 'italic' }}>Loading the planner’s work…</p>;
  if (runs.length === 0) return <p style={{ fontSize: '0.78rem', color: MUTED, margin: '0.5rem 0', fontStyle: 'italic' }}>The planner hasn’t worked on this task yet.</p>;

  const { beads, turnsById } = model;
  const loaded = stepsState !== null && runs.every(r => stepsState.byRun[r.id] !== undefined);
  const lastRun = runs[runs.length - 1];
  const working = lastRun.status === 'running';
  const follow = working ? (beads.length ? beads[beads.length - 1].id : '__end__') : null;
  const selectedTurn = selected ? turnsById.get(selected) ?? null : null;
  const selectedBead = beads.find(b => b.id === selected);
  const nodesAdded = Array.from(turnsById.values()).filter(t => t.tool?.title === 'add_node' && t.tool.status === 'completed').length;

  return (
    <div>
      <RunsheetStyles />
      {!loaded ? (
        <p style={{ fontSize: '0.74rem', color: MUTED, margin: '0.4rem 0', fontStyle: 'italic' }}>Loading the planner’s steps…</p>
      ) : beads.length === 0 && !working ? (
        <p style={{ fontSize: '0.74rem', color: MUTED, margin: '0.4rem 0', fontStyle: 'italic' }}>No steps recorded.</p>
      ) : (
        <>
          <ChainRail
            beads={beads} selectedId={selected} follow={follow}
            onSelect={id => setSelected(cur => (cur === id ? null : id))}
            ghost={working ? { label: 'working', tone: 'building' } : null}
            ariaLabel={`Planner work, ${runs.length} pass${runs.length === 1 ? '' : 'es'}, ${beads.length} steps`}
          />
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: MUTED, margin: '0.2rem 0 0' }}>
            {nodesAdded > 0 ? `${nodesAdded} node${nodesAdded === 1 ? '' : 's'} added · ` : ''}click a step to see what the model wrote and what came back
          </p>
        </>
      )}

      {selectedTurn && selectedBead && <TurnDetail turn={selectedTurn} state={selectedBead.state} />}

      <div style={{ marginTop: '0.7rem' }}>
        {runs.map(run => <PassLine key={run.id} run={run} label={passLabel(run, runs)} />)}
      </div>
    </div>
  );
}
