// components/shifts/chainModel.ts
// Turns shift data into the beads the shared ChainRail draws (components/runsheet): the PLANNER's
// steps while a shift is being planned, and the DAY's plan -- Start, each scheduled wake, End -- once
// it is planned, coloured by the live run when one is open.
import type { RailBead, RailGhost } from '@/components/runsheet/ChainRail';
import type { ToolIconSpec } from '@/components/icons/toolIcons';
import { toolIcon, toolIconIfKnown } from '@/components/icons/toolIcons';
import type { BeadState } from '@/components/runsheet/tokens';
import { clockTime, dayAndTime } from './format';
import type { AgentStep, PlannerStep, Shift, ShiftNode, ShiftRow, ShiftRun, ShiftStep } from './types';

// The pictures of a shift's own beats (its start, its wakes, its end, and what an agent does inside a wake), so a shift reads at a glance.
const ICON = {
  sun: { name: 'sun', color: '#B5651D' },
  alarm: { name: 'alarm-clock', color: '#A17F3A' },
  closing: { name: 'moon-star', color: '#5F4A8C' },
  moon: { name: 'moon', color: '#5F4A8C' },
  layers: { name: 'layers', color: '#67655A' },
  hand: { name: 'hand', color: '#5F4A8C' },
  notes: { name: 'notebook-pen', color: '#3D5A6E' },
  routine: { name: 'repeat', color: '#3D5A6E' },
  timer: { name: 'timer', color: '#B5651D' },
  send: { name: 'send', color: '#3F7A5C' },
  eye: { name: 'eye', color: '#67655A' },
} as const satisfies Record<string, ToolIconSpec>;

// ── planner ──────────────────────────────────────────────────────────────────

function plannerBead(step: PlannerStep, turnNo: number, stale: boolean): RailBead {
  // A step still 'running' while the shift is no longer planning was cut off (crash/restart): show it as failed, never as spinning.
  if (stale && step.status === 'running') return { id: step.id, label: step.step_type === 'context' ? 'Context' : `Turn ${turnNo}`, sublabel: 'cut off', glyph: 'cross', state: 'failed', title: 'This step was interrupted before it finished' };
  if (step.step_type === 'context') {
    const tools = (step.detail?.tools as unknown[] | undefined)?.length ?? 0;
    return { id: step.id, label: 'Context', sublabel: `${tools} tool${tools === 1 ? '' : 's'}`, glyph: 'explore', icon: ICON.layers, state: 'completed', title: 'Gathered the agent’s tools and instructions' };
  }
  const label = `Turn ${turnNo}`;
  switch (step.outcome) {
    case 'explored': {
      const tool = String(step.detail?.tool ?? 'tool');
      return { id: step.id, label: tool, sublabel: step.detail?.ok === false ? 'try failed' : 'tried out', glyph: 'explore', icon: toolIconIfKnown(tool) ?? undefined, state: step.detail?.ok === false ? 'failed' : 'completed', title: `${label}: tried ${tool} before planning` };
    }
    case 'plan_accepted': return { id: step.id, label, sublabel: 'plan accepted', glyph: 'plan', state: 'completed', title: `${label}: the plan was accepted` };
    case 'plan_rejected': return { id: step.id, label, sublabel: 'plan sent back', glyph: 'replace', state: 'recovering', title: `${label}: the plan was sent back with reasons` };
    case 'no_tool_call': return { id: step.id, label, sublabel: 'no plan made', glyph: 'think', state: 'failed', title: `${label}: the model answered in plain text instead of submitting a plan` };
    case 'shift_rejected': return { id: step.id, label, sublabel: 'could not plan', glyph: 'cross', state: 'failed', title: `${label}: the planner could not make a plan` };
    case 'llm_failed': return { id: step.id, label, sublabel: 'model error', glyph: 'cross', state: 'failed', title: `${label}: the model call failed` };
    case 'unknown_tool': return { id: step.id, label, sublabel: 'wrong call', glyph: 'cross', state: 'failed', title: `${label}: the model made a call the planner does not accept` };
    default: return { id: step.id, label, sublabel: 'thinking', glyph: 'think', state: 'running', title: `${label}: the planner is working` };
  }
}

// bemain's wallet guard (wallet_guard.py) parks a shift for lack of funds by writing a last_error that
// starts with this; it is not a failure, so it must not read as one.
// Rows written before the wording changed still start with the old prefix, so both count.
const OUT_OF_FUNDS = ['Out of funds', 'Out of credits'];
// bemain (shifts/planning.py REVISION_FAILED) parks last_error with this prefix when a revision could not be applied.
export const revisionFailed = (shift: Shift): boolean => (shift.last_error ?? '').startsWith("Couldn't apply your requested changes");
// bemain (agent_guard.py) parks last_error with this prefix while the agent is switched off and the shift's planning or today's run is held.
export const agentSwitchedOff = (shift: Shift): boolean => (shift.last_error ?? '').startsWith('Agent switched off');
export const waitingForFunds = (shift: Shift): boolean => OUT_OF_FUNDS.some(prefix => (shift.last_error ?? '').startsWith(prefix));
// bemain (wallet_guard.py PLAN_ENDED) parks last_error with this prefix when the agent's plan has ended: held the same way as for funds.
export const planEnded = (shift: Shift): boolean => (shift.last_error ?? '').startsWith('Plan ended');

export function plannerRail(steps: PlannerStep[], shift: Shift): { beads: RailBead[]; ghost: RailGhost | null; follow: string | null } {
  let turn = 0;
  const planning = shift.status === 'pending' || shift.status === 'planning';
  const waiting = shift.status === 'pending' && (waitingForFunds(shift) || planEnded(shift));
  const retrying = shift.status === 'pending' && !!shift.last_error && !waiting;
  const beads = steps.map(s => plannerBead(s, s.step_type === 'turn' ? ++turn : 0, !planning || retrying));
  const running = beads.find(b => b.state === 'running');
  if (planning) {
    return { beads, ghost: running ? null : { label: waiting ? (planEnded(shift) ? 'Plan ended' : 'Waiting for funds') : retrying ? 'Retrying' : beads.length === 0 ? 'Starting' : 'Next turn', tone: 'building' }, follow: running?.id ?? beads[beads.length - 1]?.id ?? null };
  }
  if (shift.status === 'failed') return { beads, ghost: { label: 'Stopped', tone: 'stopped' }, follow: beads[beads.length - 1]?.id ?? null };
  return { beads, ghost: null, follow: null };
}

// ── the day ──────────────────────────────────────────────────────────────────

export const START_ID = 'start';
export const END_ID = 'end';

function rowState(row: ShiftRow): BeadState {
  if (row.status === 'running') return 'running';
  if (row.status === 'done') return 'completed';
  if (row.status === 'failed') return 'failed';
  if (row.status === 'skipped') return 'skipped';
  return 'queued';
}

export function dayRail(shift: Shift, run: ShiftRun | null, rows: ShiftRow[]): { beads: RailBead[]; follow: string | null } {
  const spec = shift.spec;
  if (!spec) return { beads: [], follow: null };
  const tz = spec.timezone;
  const scheduled = rows.filter(r => r.kind === 'scheduled').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const live = run?.status === 'active';
  const ended = run != null && run.status !== 'active' && run.status !== 'scheduled';

  const beads: RailBead[] = [{
    id: START_ID, label: spec.start_time, sublabel: 'Start', glyph: 'plan', icon: ICON.sun,
    state: run ? 'completed' : 'idle', title: `Shift starts at ${spec.start_time} (${tz})`,
  }];
  spec.wakes.forEach((wake, i) => {
    const row = scheduled[i];
    const final = i === spec.wakes.length - 1;
    const state: BeadState = row ? rowState(row) : 'idle';
    beads.push({
      id: `wake-${i}`, label: wake.time, sublabel: final ? 'Closing wake' : i === 0 ? 'First wake' : 'Wake', glyph: final ? 'deliver' : 'agent', icon: final ? ICON.closing : ICON.alarm,
      state: live && state === 'idle' ? 'queued' : state,
      title: `${final ? 'Closing wake' : 'Wake'} at ${wake.time}${wake.note ? `: ${wake.note}` : ''}`,
    });
  });
  beads.push({
    id: END_ID, label: spec.end_time, sublabel: 'End', glyph: 'finish', icon: ICON.moon,
    state: ended ? 'completed' : live ? 'queued' : 'idle', title: `Shift ends at ${spec.end_time} (${tz})`,
  });

  const running = beads.find(b => b.state === 'running');
  const lastDone = [...beads].reverse().find(b => b.state === 'completed');
  return { beads, follow: running?.id ?? lastDone?.id ?? null };
}

// ── captions ─────────────────────────────────────────────────────────────────

export type CaptionTone = 'neutral' | 'live' | 'good' | 'bad';

export function shiftCaption(shift: Shift, run: ShiftRun | null, rows: ShiftRow[], steps: PlannerStep[]): { text: string; tone: CaptionTone } {
  if (shift.status === 'pending' && agentSwitchedOff(shift)) {
    return { text: 'Agent switched off: planning starts by itself once it is switched back on.', tone: 'bad' };
  }
  if (shift.status === 'planned' && agentSwitchedOff(shift) && run?.status !== 'active') {
    return { text: 'Agent switched off: today\u2019s run starts if it is switched back on before the window closes.', tone: 'bad' };
  }
  if (shift.status === 'pending' && waitingForFunds(shift)) {
    return { text: 'Waiting for funds: planning starts by itself once funds are added.', tone: 'bad' };
  }
  if (shift.status === 'pending' && planEnded(shift)) {
    return { text: 'Plan ended: planning starts by itself once the agent\u2019s plan is renewed.', tone: 'bad' };
  }
  if (shift.status === 'pending' && shift.last_error) {
    return { text: `Planning attempt ${shift.plan_attempts ?? 1} failed; trying again. ${shift.last_error.replace(/^Couldn't plan this shift: /, '')}`, tone: 'bad' };
  }
  if (shift.status === 'pending' || shift.status === 'planning') {
    const turns = steps.filter(s => s.step_type === 'turn').length;
    return { text: turns === 0 ? 'Planning: the planner is reading the definition…' : `Planning: turn ${turns} of up to 14…`, tone: 'live' };
  }
  if (shift.status === 'failed') return { text: 'Not planned. Open the Planner tab to see what happened.', tone: 'bad' };
  if (shift.status === 'planned' && revisionFailed(shift) && run?.status !== 'active') {
    return { text: 'Your requested changes could not be applied; the previous plan is still in force.', tone: 'bad' };
  }
  const spec = shift.spec;
  if (!spec) return { text: '', tone: 'neutral' };
  if (shift.status === 'planned' && waitingForFunds(shift) && run?.status !== 'active') {
    return { text: 'Waiting for funds: today\u2019s run starts by itself once funds are added.', tone: 'bad' };
  }
  if (shift.status === 'planned' && planEnded(shift) && run?.status !== 'active') {
    return { text: 'Plan ended: today\u2019s run starts by itself once the agent\u2019s plan is renewed.', tone: 'bad' };
  }
  if (run?.status === 'active') {
    const scheduled = rows.filter(r => r.kind === 'scheduled');
    const done = scheduled.filter(r => r.status === 'done' || r.status === 'failed' || r.status === 'skipped').length;
    const next = scheduled.find(r => r.status === 'scheduled');
    const working = rows.find(r => r.status === 'running');
    return {
      text: working ? `Running · working on ${working.label}` : `Running · ${done} of ${scheduled.length} wakes done${next ? ` · next ${clockTime(next.scheduled_for, spec.timezone)}` : ''}`,
      tone: 'live',
    };
  }
  return { text: `Planned · next run ${dayAndTime(shift.next_start_at, spec.timezone)}`, tone: 'good' };
}

// ── inside one wake: the agent's own decisions, and the work chain it staged ──────────────────

const AGENT_KIND: Record<AgentStep['kind'], { label: string; glyph: RailBead['glyph']; icon?: ToolIconSpec }> = {
  context: { label: 'Told', glyph: 'explore', icon: ICON.layers },
  node: { label: 'Add step', glyph: 'add' },
  unnode: { label: 'Drop step', glyph: 'remove' },
  handoff: { label: 'Handoff', glyph: 'think', icon: ICON.hand },
  report: { label: 'Report notes', glyph: 'plan', icon: ICON.notes },
  finish: { label: 'Finish', glyph: 'finish' },
  wake: { label: 'Set next wake', glyph: 'agent', icon: ICON.alarm },
  routine: { label: 'Routine', glyph: 'plan', icon: ICON.routine },
  cron: { label: 'Set cron', glyph: 'agent', icon: ICON.timer },
  submit: { label: 'Submit report', glyph: 'deliver', icon: ICON.send },
  look: { label: 'Look', glyph: 'explore', icon: ICON.eye },
  rejected: { label: 'Rejected', glyph: 'cross' },
  no_call: { label: 'No answer', glyph: 'think' },
  llm_failed: { label: 'Model error', glyph: 'cross' },
};

export function agentKindLabel(kind: AgentStep['kind']): string { return AGENT_KIND[kind]?.label ?? kind; }

export function agentRail(steps: AgentStep[]): { beads: RailBead[]; follow: string | null } {
  const beads: RailBead[] = steps.map(s => {
    const meta = AGENT_KIND[s.kind] ?? { label: s.kind, glyph: 'think' as const };
    const state: BeadState = s.kind === 'context' ? 'completed' : s.kind === 'no_call' || s.kind === 'rejected' ? 'recovering' : s.ok ? 'completed' : 'failed';
    const label = s.kind === 'look' && s.tool ? s.tool : meta.label;
    return {
      id: s.id, label, sublabel: s.kind === 'look' ? 'look' : s.counted ? `#${s.step_number}` : undefined, glyph: meta.glyph, icon: s.kind === 'look' && s.tool ? toolIconIfKnown(s.tool) ?? meta.icon : meta.icon, state,
      title: `${meta.label}${s.tool && s.kind !== 'look' ? ` (${s.tool})` : ''}${s.ok ? '' : ' — did not work'}`,
    };
  });
  return { beads, follow: beads[beads.length - 1]?.id ?? null };
}

export function workRail(steps: ShiftStep[], nodes: ShiftNode[]): { beads: RailBead[]; follow: string | null } {
  const beads: RailBead[] = steps.map(s => {
    const node = nodes.find(n => n.id === s.node_id);
    const key = (node?.config.output_key as string | undefined) ?? `step ${s.step_number}`;
    const tool = node?.config.tool_name as string | undefined;
    const state: BeadState = s.status === 'completed' ? 'completed' : s.status === 'failed' ? 'failed' : s.status === 'running' ? 'running' : 'skipped';
    return {
      id: s.id, label: key, sublabel: tool ?? s.node_type, glyph: s.node_type === 'tool' ? 'tool' : s.node_type === 'llm_direct' ? 'llm' : 'agent', icon: s.node_type === 'tool' && tool ? toolIcon(tool) : undefined, state,
      title: `${key} · ${tool ?? s.node_type} · ${s.status}`,
    };
  });
  return { beads, follow: beads.find(b => b.state === 'running')?.id ?? null };
}
