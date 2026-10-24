// components/runsheet/chainModel.ts
// Pure functions that turn rows (chain nodes + a run's steps) into what the rail draws:
// which state each bead is in, what it is called, and the one-line caption that sums the
// chain up. No React, no network -- everything the UI decides about a node lives here.
import { toolIcon } from '@/components/icons/toolIcons';
import type { RailBead } from './ChainRail';
import type { BeadState, GlyphKey } from './tokens';
import type { ChainNode, ChainTask, RunLite, RunStatus, RunStep, StepGroup } from './types';

// ─── steps ──────────────────────────────────────────────────────────────────

/** Groups a run's step rows by step number. A step that failed and was repaired has
 *  several rows; the newest is the live one, the rest are its earlier attempts. */
export function groupSteps(steps: RunStep[]): Map<number, StepGroup> {
  const byNumber = new Map<number, RunStep[]>();
  for (const s of steps) byNumber.set(s.step_number, [...(byNumber.get(s.step_number) ?? []), s]);
  const out = new Map<number, StepGroup>();
  for (const [n, rows] of byNumber) {
    const sorted = [...rows].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
    out.set(n, { latest: sorted[sorted.length - 1], attempts: sorted.length, earlier: sorted.slice(0, -1) });
  }
  return out;
}

// ─── nodes ──────────────────────────────────────────────────────────────────

export function isDeliveryNode(node: ChainNode): boolean {
  return node.node_type === 'tool' && (node.config.tool_name === 'submit_to_chat' || node.config.tool_name === 'push_notification');
}

export function nodeGlyph(node: ChainNode): GlyphKey {
  if (isDeliveryNode(node)) return 'deliver';
  if (node.node_type === 'llm_direct') return 'llm';
  if (node.node_type === 'llm_agentic') return 'agent';
  return 'tool';
}

export function nodeTypeTag(node: ChainNode): string {
  if (isDeliveryNode(node)) return 'Delivery';
  if (node.node_type === 'llm_direct') return 'LLM';
  if (node.node_type === 'llm_agentic') return 'Agent';
  return 'Tool';
}

/** A tool node shows the tool's own picture; the other node types keep their glyph. */
export function nodeIcon(node: ChainNode) {
  return node.node_type === 'tool' && node.config.tool_name ? toolIcon(node.config.tool_name) : undefined;
}

export function nodeLabel(node: ChainNode): string {
  return node.config.output_key || node.config.tool_name || nodeTypeTag(node).toLowerCase();
}

/** One plain line saying what the node does. */
export function nodeSummary(node: ChainNode): string {
  if (node.node_type === 'tool') return node.config.tool_name ? `Calls ${node.config.tool_name}` : 'Tool call';
  const instruction = (node.config.instruction ?? '').replace(/\s+/g, ' ').trim();
  return instruction.length > 160 ? `${instruction.slice(0, 160)}…` : instruction;
}

export function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// ─── states ─────────────────────────────────────────────────────────────────

export interface ChainCtx {
  /** the run whose steps are being shown; null = nothing is running (a planned chain at rest) */
  runStatus: RunStatus | null;
  /** the task is being repaired/resumed by the recovery engine */
  recovering: boolean;
  /** the chain is still being built by the planner */
  draft: boolean;
}

export function beadState(group: StepGroup | undefined, ctx: ChainCtx): BeadState {
  if (ctx.draft) return 'building';
  if (group) {
    const status = group.latest.status;
    if (status === 'running') return 'running';
    if (status === 'completed') return 'completed';
    return ctx.runStatus === 'stuck' || ctx.recovering ? 'recovering' : 'failed';
  }
  if (ctx.runStatus === 'running' || ctx.runStatus === 'stuck') return 'queued';
  if (ctx.runStatus === 'failed') return 'skipped';
  return 'idle';
}

function stateWord(state: BeadState): string {
  return { idle: 'planned', queued: 'queued', running: 'running', completed: 'completed', failed: 'failed', recovering: 'being repaired', skipped: 'not reached', building: 'built' }[state];
}

export function buildBeads(nodes: ChainNode[], groups: Map<number, StepGroup>, ctx: ChainCtx): RailBead[] {
  return [...nodes].sort((a, b) => a.step_number - b.step_number).map(node => {
    const group = groups.get(node.step_number);
    const state = beadState(group, ctx);
    const duration = group ? formatDuration(group.latest.started_at, group.latest.ended_at) : null;
    const tag = nodeTypeTag(node);
    return {
      id: String(node.step_number),
      label: nodeLabel(node),
      sublabel: duration ? `${tag} · ${duration}` : tag,
      glyph: nodeGlyph(node),
      icon: nodeIcon(node),
      state,
      fixed: state === 'completed' && (group?.attempts ?? 0) > 1,
      title: `Step ${node.step_number}: ${nodeLabel(node)} (${tag.toLowerCase()}) — ${stateWord(state)}`,
    };
  });
}

/** The bead the rail should keep in view: the one in motion, else the one that stopped. */
export function followBead(beads: RailBead[], building: boolean): string | null {
  if (building) return '__end__';
  const moving = beads.find(b => b.state === 'running' || b.state === 'recovering');
  if (moving) return moving.id;
  const failed = beads.find(b => b.state === 'failed');
  return failed ? failed.id : null;
}

// ─── caption ────────────────────────────────────────────────────────────────

export type CaptionTone = 'neutral' | 'live' | 'good' | 'bad' | 'warn';

export function chainCaption(args: {
  task: ChainTask | null;
  beads: RailBead[];
  run: RunLite | null;
  runStatus: RunStatus | null;
  draft: boolean;
  recovering: boolean;
  formatTime: (iso: string) => string;
}): { text: string; tone: CaptionTone } {
  const { task, beads, run, runStatus, draft, recovering, formatTime } = args;
  const count = beads.length;
  const plural = (n: number) => `${n} node${n === 1 ? '' : 's'}`;

  if (task && !task.active_chain_id) {
    if (task.status === 'pending') return { text: 'Waiting to be planned', tone: 'neutral' };
    if (task.status === 'planning') return { text: count ? `Building the chain · ${plural(count)} so far` : 'Planning…', tone: 'live' };
    if (task.status === 'failed') return { text: count ? `Planning stopped after ${plural(count)}` : 'Planning failed', tone: 'bad' };
    if (task.status === 'cancelled') return { text: 'Never planned', tone: 'neutral' };
  }
  if (draft) return { text: `Building the chain · ${plural(count)} so far`, tone: 'live' };

  const running = beads.find(b => b.state === 'running');
  const failed = beads.find(b => b.state === 'failed');
  const repairing = beads.find(b => b.state === 'recovering');
  if (repairing || (recovering && runStatus === 'stuck')) return { text: `Step ${repairing?.id ?? '?'} failed · repairing it`, tone: 'warn' };
  if (running) return { text: `Running step ${running.id} of ${count}`, tone: 'live' };
  if (runStatus === 'running') return { text: `Starting · ${plural(count)}`, tone: 'live' };
  if (failed) return { text: `Failed at step ${failed.id}`, tone: 'bad' };
  if (runStatus === 'completed' && run) {
    const took = run.ended_at ? ` in ${formatDuration(run.started_at, run.ended_at)}` : '';
    return { text: `Completed${took} · ${plural(count)}`, tone: 'good' };
  }
  if (task && task.trigger_type === 'cron') {
    const next = task.next_run_at ? ` · next run ${formatTime(task.next_run_at)}` : '';
    if (task.last_error) return { text: `${plural(count)} · last run failed${next}`, tone: 'bad' };
    return { text: `${plural(count)}${next}`, tone: 'neutral' };
  }
  return { text: `${plural(count)} · ready to run`, tone: 'neutral' };
}
