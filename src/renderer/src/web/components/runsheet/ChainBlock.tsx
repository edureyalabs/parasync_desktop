// components/runsheet/ChainBlock.tsx
'use client';

// The chain view a Runsheet card shows: the rail (always visible), a one-line caption, and --
// when expanded -- a bigger rail with the Chain tab (click a bead to open just that step's
// input / result / error) and the Planner tab (every planning and repair pass).
//
//   TaskChainBlock -- a live task (Active tab, and History entries that never ran).
//   RunChainBlock  -- one finished run (History tab), loaded when its card scrolls into view.
import { useMemo, useState } from 'react';
import { ChainRail, type RailBead, type RailGhost } from './ChainRail';
import { NodeDetail } from './NodeDetail';
import { PlannerView } from './PlannerView';
import { RunsheetStyles } from './RunsheetStyles';
import { buildBeads, chainCaption, followBead, formatDuration, groupSteps, type CaptionTone } from './chainModel';
import { useRunSnapshot, useTaskChain } from './useChainData';
import { INK, LINE, MUTED, SOFT } from './tokens';
import type { ChainNode, ChainTask, RunLite, RunStatus, StepGroup } from './types';

const CAPTION_COLOR: Record<CaptionTone, string> = { neutral: SOFT, live: '#A17F3A', good: '#3D7A4F', bad: '#B34A3C', warn: '#B5651D' };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ─── shell ──────────────────────────────────────────────────────────────────

interface ShellProps {
  beads: RailBead[];
  ghost: RailGhost | null;
  follow: string | null;
  nodes: ChainNode[];
  groups: Map<number, StepGroup>;
  caption: { text: string; tone: CaptionTone };
  /** set to offer the Planner tab */
  plannerTaskId: string | null;
  live: boolean;
  emptyText: string | null;
  ariaLabel: string;
  /** the parent owns this: a collapsed card loads nothing and draws no rail */
  expanded: boolean;
  onToggle: () => void;
  canExpand: boolean;
  /** open the card already on a tab / step (used by the visual harness and deep links) */
  initial?: ChainBlockInitial;
}

export interface ChainBlockInitial {
  expanded?: boolean;
  tab?: 'chain' | 'planner';
  /** a step number, as a string */
  selected?: string;
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      style={{
        border: 'none', cursor: 'pointer', padding: '0.18rem 0.6rem', borderRadius: 999, fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem',
        letterSpacing: '0.05em', textTransform: 'uppercase', background: active ? INK : 'transparent', color: active ? '#F7F6F2' : SOFT,
      }}
    >
      {label}
    </button>
  );
}

function ChainShell({ beads, ghost, follow, nodes, groups, caption, plannerTaskId, live, emptyText, ariaLabel, expanded, onToggle, canExpand, initial }: ShellProps) {
  const [tab, setTab] = useState<'chain' | 'planner'>(initial?.tab ?? 'chain');
  const [selected, setSelected] = useState<string | null>(initial?.selected ?? null);

  const selectedNode = selected ? nodes.find(n => String(n.step_number) === selected) : undefined;
  const selectedBead = selected ? beads.find(b => b.id === selected) : undefined;

  const onSelect = (id: string) => {
    if (tab !== 'chain') { setTab('chain'); setSelected(id); return; }
    setSelected(cur => (cur === id ? null : id));
  };

  const hasRail = beads.length > 0 || ghost !== null;

  return (
    <div style={{ marginTop: '0.7rem', paddingTop: '0.55rem', borderTop: `1px dashed ${LINE}` }}>
      <RunsheetStyles />
      {expanded && (hasRail ? (
        <ChainRail
          beads={beads} ghost={ghost} selectedId={tab === 'chain' ? selected : null}
          onSelect={onSelect} follow={follow} ariaLabel={ariaLabel}
        />
      ) : (
        emptyText && <p style={{ fontSize: '0.74rem', color: MUTED, margin: '0.2rem 0', fontStyle: 'italic' }}>{emptyText}</p>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.66rem', color: CAPTION_COLOR[caption.tone] }}>
          {(caption.tone === 'live' || caption.tone === 'warn') && (
            <span className="rs-anim" style={{ width: 6, height: 6, borderRadius: '50%', background: CAPTION_COLOR[caption.tone], animation: 'rsBreathe 1.2s ease-in-out infinite' }} />
          )}
          {caption.text}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {expanded && plannerTaskId && (
            <div style={{ display: 'inline-flex', background: '#F0EEE5', borderRadius: 999, padding: 2 }}>
              <TabButton label="Chain" active={tab === 'chain'} onClick={() => setTab('chain')} />
              <TabButton label="Planner" active={tab === 'planner'} onClick={() => setTab('planner')} />
            </div>
          )}
          {canExpand && (
            <button
              type="button" onClick={onToggle} aria-expanded={expanded}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'Inter', sans-serif", fontSize: '0.72rem', color: SOFT, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              {expanded ? 'Collapse' : 'Details'}
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}>
                <path d="M2 1l4.5 3.5L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {expanded && tab === 'chain' && (
        selectedNode && selectedBead
          ? <NodeDetail node={selectedNode} group={groups.get(selectedNode.step_number)} state={selectedBead.state} />
          : hasRail && <p style={{ fontSize: '0.72rem', color: MUTED, margin: '0.5rem 0 0' }}>Click a step to see its input, result and any error.</p>
      )}
      {expanded && tab === 'planner' && plannerTaskId && (
        <div style={{ marginTop: '0.6rem' }}><PlannerView taskId={plannerTaskId} live={live} /></div>
      )}
    </div>
  );
}

// ─── a live task ────────────────────────────────────────────────────────────

/** A cron task at rest shows its chain idle; only an active run lights the beads up. */
function effectiveRunStatus(task: ChainTask, run: RunLite | null): RunStatus | null {
  if (!run) return task.status === 'running' ? 'running' : null;
  if (task.trigger_type === 'cron' && task.status === 'planned' && (run.status === 'completed' || run.status === 'failed')) return null;
  return run.status;
}

/** What a collapsed card says. It comes from the task row alone: nothing is loaded until the card is opened. */
function collapsedTaskCaption(task: ChainTask, recovering: boolean): { text: string; tone: CaptionTone } {
  if (!task.active_chain_id) {
    if (task.status === 'pending') return { text: 'Waiting to be planned', tone: 'neutral' };
    if (task.status === 'planning') return { text: 'Planning…', tone: 'live' };
    if (task.status === 'failed') return { text: 'Planning failed', tone: 'bad' };
    return { text: 'Never planned', tone: 'neutral' };
  }
  if (task.status === 'running') return recovering ? { text: 'Running · repairing a step', tone: 'warn' } : { text: 'Running', tone: 'live' };
  if (task.status === 'failed') return { text: 'Failed', tone: 'bad' };
  if (task.status === 'completed') return { text: 'Completed', tone: 'good' };
  if (task.trigger_type === 'cron') {
    const next = task.next_run_at ? ` · next run ${formatTime(task.next_run_at)}` : '';
    return task.last_error ? { text: `Last run failed${next}`, tone: 'bad' } : { text: `Scheduled${next}`, tone: 'neutral' };
  }
  return { text: 'Ready to run', tone: 'neutral' };
}

export function TaskChainBlock({ task, recovering = false, live = true, initial }: { task: ChainTask; recovering?: boolean; live?: boolean; initial?: ChainBlockInitial }) {
  const [expanded, setExpanded] = useState(initial?.expanded ?? false);
  const data = useTaskChain(task, live, expanded);
  const runStatus = effectiveRunStatus(task, data.run);
  // At rest (a cron chain between runs) the beads show the plan, not the last run's results.
  const groups = useMemo(() => (runStatus ? groupSteps(data.steps) : new Map<number, StepGroup>()), [data.steps, runStatus]);
  const isRecovering = recovering && task.status === 'running';

  const beads = useMemo(
    () => buildBeads(data.nodes, groups, { runStatus, recovering: isRecovering, draft: data.draft }),
    [data.nodes, groups, runStatus, isRecovering, data.draft],
  );

  let ghost: RailGhost | null = null;
  if (task.status === 'pending') ghost = { label: 'waiting', tone: 'building' };
  else if (task.status === 'planning') ghost = { label: `adding #${beads.length + 1}`, tone: 'building' };
  else if (task.status === 'failed' && !task.active_chain_id && beads.length > 0) ghost = { label: `#${beads.length + 1} stopped`, tone: 'stopped' };

  const caption = expanded
    ? chainCaption({ task, beads, run: data.run, runStatus, draft: data.draft, recovering: isRecovering, formatTime })
    : collapsedTaskCaption(task, isRecovering);
  const follow = followBead(beads, ghost?.tone === 'building');
  const never = !task.active_chain_id && beads.length === 0 && ghost === null;

  return (
    <ChainShell
      beads={beads} ghost={ghost} follow={follow} nodes={data.nodes} groups={groups} caption={caption}
      plannerTaskId={task.status === 'pending' ? null : task.id} live={live}
      emptyText={never ? 'This task was never planned.' : null} ariaLabel={`Task chain, ${beads.length} nodes`}
      expanded={expanded} onToggle={() => setExpanded(e => !e)} canExpand={task.status !== 'pending' || task.active_chain_id !== null} initial={initial}
    />
  );
}

// ─── one finished run ───────────────────────────────────────────────────────

function collapsedRunCaption(run: { status: RunStatus; started_at: string; ended_at: string | null }): { text: string; tone: CaptionTone } {
  if (run.status === 'completed') {
    const took = run.ended_at ? formatDuration(run.started_at, run.ended_at) : null;
    return { text: took ? `Completed in ${took}` : 'Completed', tone: 'good' };
  }
  if (run.status === 'failed') return { text: 'Failed', tone: 'bad' };
  if (run.status === 'stuck') return { text: 'Stuck · being repaired', tone: 'warn' };
  return { text: 'Running', tone: 'live' };
}

export function RunChainBlock({ run, taskId, initial }: { initial?: ChainBlockInitial; run: { id: string; chain_id: string | null; status: RunStatus; started_at: string; ended_at: string | null; trigger_source: string }; taskId: string }) {
  const [expanded, setExpanded] = useState(initial?.expanded ?? false);
  // Loaded only once the card is opened -- a long History list costs nothing until then.
  const snap = useRunSnapshot(run.id, run.chain_id, expanded);
  const groups = useMemo(() => groupSteps(snap.steps), [snap.steps]);
  const beads = useMemo(() => buildBeads(snap.nodes, groups, { runStatus: run.status, recovering: false, draft: false }), [snap.nodes, groups, run.status]);
  const lite: RunLite = { id: run.id, status: run.status, trigger_source: run.trigger_source, started_at: run.started_at, ended_at: run.ended_at };
  const caption = expanded && snap.ready
    ? chainCaption({ task: null, beads, run: lite, runStatus: run.status, draft: false, recovering: false, formatTime })
    : collapsedRunCaption(run);
  const follow = followBead(beads, false);

  return (
    <ChainShell
      beads={beads} ghost={null} follow={follow} nodes={snap.nodes} groups={groups} caption={caption}
      plannerTaskId={taskId} live={false} emptyText={snap.ready || !run.chain_id ? (run.chain_id ? null : 'No chain was recorded for this run.') : 'Loading the chain…'}
      ariaLabel={`Run chain, ${beads.length} nodes`}
      expanded={expanded} onToggle={() => setExpanded(e => !e)} canExpand initial={initial}
    />
  );
}
