// app/agents/[id]/watchtower/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { TabHeader } from '@/components/agent-ui/TabHeader';

type StepType = 'llm_call' | 'tool_call';
type RunStatus = 'running' | 'completed' | 'failed';
type TriggerSource = 'chat' | 'cron';
// Added 2026-09-24 (Agent Types redesign) — 'full' is the original
// single-pass system (retired 2026-09-25, archived not deleted — see
// bemain's backup/legacy_orchestrator/); 'planning'/'execution'/'review'
// are the three agent modes of the turn_pipeline.py pipeline (see
// bemain/agents/__init__.py) that replaced it, itself no longer live as
// of 2026-09-25 (kept intact, just not dispatched to). 'assistant' (added
// 2026-09-25) is the new one-on-one conversational agent species — one run
// per turn, no planner/executor/reviewer split — and is the live pipeline
// now.
type PassKind = 'full' | 'planning' | 'execution' | 'review' | 'assistant';
type TurnStatus = 'in_progress' | 'completed' | 'failed_reported' | 'stuck';

interface ActivityStep {
  id:             string;
  run_id:         string;
  step_type:      StepType;
  step_number:    number;
  title:          string;
  status:         RunStatus;
  input_excerpt:  string | null;
  output_excerpt: string | null;
  error:          string | null;
  started_at:     string;
  ended_at:       string | null;
}

interface RunRow {
  id:                    string;
  chat_id:               string;
  trigger_source:        TriggerSource;
  status:                RunStatus;
  iterations_used:       number;
  llm_calls_total:       number;
  llm_calls_failed:      number;
  tool_calls_total:      number;
  tool_calls_succeeded:  number;
  tool_calls_failed:     number;
  exit_reason:           string | null;
  plan:                  string | null;
  pass_kind:             PassKind;
  turn_id:               string | null;
  retry_index:           number | null;
  started_at:            string;
  ended_at:              string | null;
}

// Added 2026-09-24 (Agent Types redesign) — one row per real triggering
// exchange, grouping the several RunRow passes (planner + up to 3 executor
// attempts + up to 2 reviewer verdicts) that make it up. Absent entirely for
// every run still on the original 'full' single-pass pipeline — those
// render as their own standalone card, exactly as before.
interface TurnRow {
  id:            string;
  chat_id:       string;
  trigger_source: TriggerSource;
  status:        TurnStatus;
  current_stage: string;
  retry_count:   number;
  final_content: string | null;
  started_at:    string;
  ended_at:      string | null;
}

interface TurnGroup {
  key:       string;
  turn:      TurnRow | null; // null = a standalone legacy 'full' run
  runs:      RunRow[];       // ascending by started_at
  startedAt: string;
}

const RUN_LIMIT = 50;

function Spinner({ size = 20, color = '#26251E' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function statusColor(status: RunStatus): { fg: string; bg: string; border: string } {
  if (status === 'running')  return { fg: '#A17F3A', bg: '#EFE4C9', border: '#E4D2A0' };
  if (status === 'failed')   return { fg: '#B34A3C', bg: '#F5E6E1', border: '#E3C4BB' };
  return { fg: '#26251E', bg: '#EDEBE2', border: '#E2DFD3' };
}

// Maps a turn's own status vocabulary onto the same three-color scheme runs
// already use, so a turn card and its sub-run pills read consistently.
function turnStatusAsRunStatus(status: TurnStatus): RunStatus {
  if (status === 'in_progress') return 'running';
  if (status === 'completed') return 'completed';
  return 'failed'; // failed_reported / stuck
}

function StatusDot({ status, size = 9 }: { status: RunStatus; size?: number }) {
  const c = statusColor(status);
  return (
    <>
      <div
        style={{
          width: size, height: size, borderRadius: '50%', background: c.fg, flexShrink: 0,
          animation: status === 'running' ? 'wtPulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
      {status === 'running' && <style>{`@keyframes wtPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>}
    </>
  );
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 14 14" fill="none"
      style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
    >
      <path d="M5 3l4 4-4 4" stroke="#9E9C8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExcerptBlock({ label, content, danger = false }: { label: string; content: string; danger?: boolean }) {
  return (
    <div>
      <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', color: danger ? '#B34A3C' : '#9E9C8F', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.2rem' }}>
        {label}
      </p>
      <pre
        style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.7rem', lineHeight: 1.45,
          background: danger ? '#F5E6E1' : '#F7F6F2', border: `1px solid ${danger ? '#E3C4BB' : '#E2DFD3'}`,
          borderRadius: 4, padding: '0.5rem 0.6rem', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 220, overflowY: 'auto', color: danger ? '#8A382D' : '#42402F',
        }}
      >
        {content}
      </pre>
    </div>
  );
}

function stepTypeLabel(stepType: StepType): string {
  return stepType === 'llm_call' ? 'LLM' : 'TOOL';
}

function stepTypeColor(stepType: StepType): string {
  return stepType === 'llm_call' ? '#7C5F27' : '#3D5A6E';
}

function triggerBadge(source: TriggerSource): { label: string; fg: string; bg: string; border: string } {
  if (source === 'cron') return { label: 'cron', fg: '#7C5F27', bg: '#F1E9D6', border: '#E4D2A0' };
  return { label: 'chat', fg: '#67655A', bg: '#EDEBE2', border: '#E2DFD3' };
}

function passKindBadge(kind: PassKind): { label: string; fg: string; bg: string; border: string } {
  if (kind === 'planning') return { label: 'plan', fg: '#7C5F27', bg: '#F1E9D6', border: '#E4D2A0' };
  if (kind === 'execution') return { label: 'execute', fg: '#3D5A6E', bg: '#E3EBEF', border: '#C7D8E0' };
  if (kind === 'review') return { label: 'review', fg: '#5F4A8C', bg: '#EAE4F5', border: '#D6C9EC' };
  if (kind === 'assistant') return { label: 'reply', fg: '#3F7A5C', bg: '#E1EFE7', border: '#C3DECF' };
  return { label: 'run', fg: '#67655A', bg: '#EDEBE2', border: '#E2DFD3' };
}

function CountStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', color: '#9E9C8F', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.1rem' }}>{label}</p>
      <p style={{ fontSize: '0.8rem', color: '#26251E', margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>{value}</p>
    </div>
  );
}

// ─── Step timeline ──────────────────────────────────────────────────────────

function StepTimeline({
  steps, loading, expandedStep, onToggleStep,
}: {
  steps: ActivityStep[] | undefined;
  loading: boolean;
  expandedStep: string | null;
  onToggleStep: (id: string) => void;
}) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0' }}>
        <Spinner size={14} />
      </div>
    );
  }
  if (!steps || steps.length === 0) {
    return <p style={{ fontSize: '0.76rem', color: '#9E9C8F', margin: 0 }}>No steps recorded for this run.</p>;
  }
  return (
    <div style={{ position: 'relative', paddingLeft: '1.2rem' }}>
      <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 1, background: '#E2DFD3' }} />
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const stepExpanded = expandedStep === step.id;
        const c = statusColor(step.status);
        return (
          <div key={step.id} style={{ position: 'relative', marginBottom: isLast ? 0 : '0.5rem' }}>
            <div
              style={{
                position: 'absolute', left: -17, top: 4, width: 7, height: 7, borderRadius: '50%',
                background: c.fg, border: '2px solid #fff', boxShadow: '0 0 0 1px #E2DFD3',
                animation: step.status === 'running' ? 'wtPulse 1.4s ease-in-out infinite' : undefined,
              }}
            />
            <div
              onClick={() => onToggleStep(step.id)}
              style={{ cursor: (step.input_excerpt || step.output_excerpt || step.error) ? 'pointer' : 'default' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', color: stepTypeColor(step.step_type),
                    textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
                  }}
                >
                  {stepTypeLabel(step.step_type)}
                </span>
                <p style={{ fontSize: '0.8rem', color: '#26251E', margin: 0 }}>{step.title}</p>
                <span style={{ fontSize: '0.66rem', color: '#9E9C8F', fontFamily: "'IBM Plex Mono',monospace" }}>
                  {formatDuration(step.started_at, step.ended_at)}
                </span>
                {step.status === 'failed' && (
                  <span style={{ fontSize: '0.64rem', color: '#B34A3C', fontFamily: "'IBM Plex Mono',monospace" }}>failed</span>
                )}
              </div>
              {stepExpanded && (
                <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: 560 }}>
                  {step.input_excerpt && <ExcerptBlock label="Input" content={step.input_excerpt} />}
                  {step.output_excerpt && <ExcerptBlock label="Output" content={step.output_excerpt} />}
                  {step.error && <ExcerptBlock label="Error" content={step.error} danger />}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── One pass (run) — used both standalone (legacy 'full') and nested inside a turn ──

function RunDetail({
  run, expanded, onToggle, steps, loadingSteps, expandedStep, onToggleStep, compact,
}: {
  run: RunRow;
  expanded: boolean;
  onToggle: () => void;
  steps: ActivityStep[] | undefined;
  loadingSteps: boolean;
  expandedStep: string | null;
  onToggleStep: (id: string) => void;
  compact: boolean; // true when nested inside a turn card
}) {
  const badge = compact ? passKindBadge(run.pass_kind) : triggerBadge(run.trigger_source);

  return (
    <div style={{ background: compact ? '#FAFAF7' : '#fff', border: '1px solid #E2DFD3', borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', padding: compact ? '0.55rem 0.75rem' : '0.65rem 1rem',
          background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: '0.65rem', font: 'inherit',
        }}
      >
        <StatusDot status={run.status} size={8} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {!compact && (
              <p style={{ fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: 0, letterSpacing: '-0.01em' }}>
                Chat turn
              </p>
            )}
            <span
              style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', padding: '0.08rem 0.35rem', borderRadius: 3,
                background: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`,
              }}
            >
              {badge.label}
            </span>
            {run.retry_index !== null && run.retry_index > 0 && (
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', color: '#9E9C8F' }}>
                retry {run.retry_index}
              </span>
            )}
            {run.status === 'failed' && run.exit_reason && (
              <span
                style={{
                  fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', padding: '0.08rem 0.35rem', borderRadius: 3,
                  background: '#F5E6E1', color: '#B34A3C', border: '1px solid #E3C4BB',
                }}
              >
                {run.exit_reason.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.66rem', color: '#9E9C8F', margin: '0.15rem 0 0', fontFamily: "'IBM Plex Mono',monospace" }}>
            {new Date(run.started_at).toLocaleString()} · {formatDuration(run.started_at, run.ended_at)}
            {run.status === 'running' && ' · running'}
            {' · '}{run.llm_calls_total} LLM · {run.tool_calls_total} tool{run.tool_calls_total === 1 ? '' : 's'}
          </p>
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid #E2DFD3', padding: '0.65rem 1rem 0.8rem' }}>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '0.75rem', paddingBottom: '0.65rem', borderBottom: '1px solid #EDEBE2' }}>
            <CountStat label="Iterations" value={String(run.iterations_used)} />
            <CountStat label="LLM calls" value={run.llm_calls_failed > 0 ? `${run.llm_calls_total} (${run.llm_calls_failed} failed)` : String(run.llm_calls_total)} />
            <CountStat label="Tool calls" value={run.tool_calls_failed > 0 ? `${run.tool_calls_total} (${run.tool_calls_failed} failed)` : String(run.tool_calls_total)} />
          </div>
          {run.plan && (
            <div style={{ marginBottom: '0.75rem' }}>
              <ExcerptBlock label={run.pass_kind === 'assistant' ? 'Reply' : 'Plan for this turn'} content={run.plan} />
            </div>
          )}
          <StepTimeline steps={steps} loading={loadingSteps} expandedStep={expandedStep} onToggleStep={onToggleStep} />
        </div>
      )}
    </div>
  );
}

// ─── Turn card — groups a turn's planner/executor/reviewer passes; a legacy
// 'full' run with no turn renders through the same shell as a single pass ──

function TurnCard({
  group, expandedRun, onToggleRun, stepsByRun, loadingStepsFor, expandedStep, onToggleStep,
}: {
  group: TurnGroup;
  expandedRun: string | null;
  onToggleRun: (runId: string) => void;
  stepsByRun: Record<string, ActivityStep[]>;
  loadingStepsFor: string | null;
  expandedStep: string | null;
  onToggleStep: (id: string) => void;
}) {
  const [groupExpanded, setGroupExpanded] = useState(false);

  // A standalone legacy run (no orchestrator_turns row) renders as exactly
  // one pass, no group header — unchanged shape from before this redesign.
  if (!group.turn) {
    const run = group.runs[0];
    return (
      <RunDetail
        run={run} compact={false}
        expanded={expandedRun === run.id} onToggle={() => onToggleRun(run.id)}
        steps={stepsByRun[run.id]} loadingSteps={loadingStepsFor === run.id}
        expandedStep={expandedStep} onToggleStep={onToggleStep}
      />
    );
  }

  const turn = group.turn;
  const runStatus = turnStatusAsRunStatus(turn.status);
  const badge = triggerBadge(turn.trigger_source);
  const kindCounts = group.runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.pass_kind] = (acc[r.pass_kind] || 0) + 1;
    return acc;
  }, {});
  const summary = (['planning', 'execution', 'review', 'assistant'] as PassKind[])
    .filter(k => kindCounts[k])
    .map(k => `${kindCounts[k]} ${passKindBadge(k).label}`)
    .join(' · ');

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={() => setGroupExpanded(v => !v)}
        style={{
          width: '100%', textAlign: 'left', padding: '0.65rem 1rem', background: 'transparent',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.65rem',
          font: 'inherit',
        }}
      >
        <StatusDot status={runStatus} size={8} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: 0, letterSpacing: '-0.01em' }}>
              Chat turn
            </p>
            <span
              style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', padding: '0.08rem 0.35rem', borderRadius: 3,
                background: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`,
              }}
            >
              {badge.label}
            </span>
            {turn.status === 'failed_reported' && (
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', padding: '0.08rem 0.35rem', borderRadius: 3, background: '#F5E6E1', color: '#B34A3C', border: '1px solid #E3C4BB' }}>
                reported failure
              </span>
            )}
            {turn.status === 'stuck' && (
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.58rem', padding: '0.08rem 0.35rem', borderRadius: 3, background: '#F5E6E1', color: '#B34A3C', border: '1px solid #E3C4BB' }}>
                stuck
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.66rem', color: '#9E9C8F', margin: '0.15rem 0 0', fontFamily: "'IBM Plex Mono',monospace" }}>
            {new Date(turn.started_at).toLocaleString()} · {formatDuration(turn.started_at, turn.ended_at)}
            {turn.status === 'in_progress' && ` · ${turn.current_stage}`}
            {' · '}{summary || `${group.runs.length} pass${group.runs.length === 1 ? '' : 'es'}`}
          </p>
        </div>
        <ChevronIcon expanded={groupExpanded} />
      </button>

      {groupExpanded && (
        <div style={{ borderTop: '1px solid #E2DFD3', padding: '0.65rem 1rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {turn.final_content && (
            <ExcerptBlock label="Final answer" content={turn.final_content} />
          )}
          {group.runs.map(run => (
            <RunDetail
              key={run.id} run={run} compact
              expanded={expandedRun === run.id} onToggle={() => onToggleRun(run.id)}
              steps={stepsByRun[run.id]} loadingSteps={loadingStepsFor === run.id}
              expandedStep={expandedStep} onToggleStep={onToggleStep}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
// Owner/admin-only... wait, actually owner+member (Watch Tower is
// user-to-agent unique, same as a member's own chat history), view-only,
// real-time — a per-agent timeline of every orchestrator run, grouped by
// turn (2026-09-24, Agent Types redesign — a turn spans a planner pass, up
// to 3 executor attempts, and up to 2 reviewer verdicts; a legacy 'full'
// pass has no turn and still renders as its own standalone card, unchanged).
// Reads `orchestrator_turns` and `orchestrator_runs` directly (RLS: org
// owner/admin see every connected user's rows, a member sees only their
// own), and `agent_activity_log` (llm_call/tool_call steps only) per run on
// expand.

export default function WatchTowerPage() {
  const { agentId, role } = useAgentCtx();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [stepsByRun, setStepsByRun] = useState<Record<string, ActivityStep[]>>({});
  const [loadingStepsFor, setLoadingStepsFor] = useState<string | null>(null);

  // Realtime subscription for the run/turn lists and any expanded run's steps.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const supabase = createClient();

    const channel = supabase
      .channel(`watchtower:${agentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orchestrator_runs', filter: `agent_id=eq.${agentId}` }, (payload) => {
        if (cancelled) return;
        const row = payload.new as RunRow;
        setRuns(prev => (prev.find(r => r.id === row.id) ? prev : [row, ...prev].slice(0, RUN_LIMIT)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orchestrator_runs', filter: `agent_id=eq.${agentId}` }, (payload) => {
        if (cancelled) return;
        const row = payload.new as RunRow;
        setRuns(prev => prev.map(r => (r.id === row.id ? row : r)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orchestrator_turns', filter: `agent_id=eq.${agentId}` }, (payload) => {
        if (cancelled) return;
        const row = payload.new as TurnRow;
        setTurns(prev => (prev.find(t => t.id === row.id) ? prev : [row, ...prev].slice(0, RUN_LIMIT)));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orchestrator_turns', filter: `agent_id=eq.${agentId}` }, (payload) => {
        if (cancelled) return;
        const row = payload.new as TurnRow;
        setTurns(prev => prev.map(t => (t.id === row.id ? row : t)));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_activity_log', filter: `agent_id=eq.${agentId}` }, (payload) => {
        if (cancelled) return;
        const row = payload.new as ActivityStep;
        setStepsByRun(prev => {
          if (!prev[row.run_id]) return prev; // only track steps for a run already expanded/loaded
          if (prev[row.run_id].find(s => s.id === row.id)) return prev;
          return { ...prev, [row.run_id]: [...prev[row.run_id], row].sort((a, b) => a.step_number - b.step_number) };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_activity_log', filter: `agent_id=eq.${agentId}` }, (payload) => {
        if (cancelled) return;
        const row = payload.new as ActivityStep;
        setStepsByRun(prev => {
          if (!prev[row.run_id]) return prev;
          return { ...prev, [row.run_id]: prev[row.run_id].map(s => (s.id === row.id ? row : s)) };
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  // Initial load.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();

      let runsQuery = supabase.from('orchestrator_runs').select('*').eq('agent_id', agentId);
      let turnsQuery = supabase.from('orchestrator_turns').select('*').eq('agent_id', agentId);

      // Owners see every connected user's rows (the *_owner_admin_read RLS
      // policies); a member sees only their own (*_self_read) — same
      // role-branching pattern the Crons tab already uses.
      if (role === 'member') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          runsQuery = runsQuery.eq('end_user_id', session.user.id);
          turnsQuery = turnsQuery.eq('end_user_id', session.user.id);
        }
      }

      const [{ data: runsData }, { data: turnsData }] = await Promise.all([
        runsQuery.order('started_at', { ascending: false }).limit(RUN_LIMIT),
        turnsQuery.order('started_at', { ascending: false }).limit(RUN_LIMIT),
      ]);
      if (cancelled) return;
      setRuns((runsData as RunRow[]) ?? []);
      setTurns((turnsData as TurnRow[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, role]);

  // Groups runs under their turn (agent_types pipeline) or standalone
  // (legacy 'full' pipeline, turn_id null), newest first.
  const turnGroups = useMemo<TurnGroup[]>(() => {
    const turnsById = new Map(turns.map(t => [t.id, t]));
    const runsByTurn = new Map<string, RunRow[]>();
    const standalone: RunRow[] = [];

    for (const run of runs) {
      if (run.turn_id && turnsById.has(run.turn_id)) {
        const list = runsByTurn.get(run.turn_id) ?? [];
        list.push(run);
        runsByTurn.set(run.turn_id, list);
      } else {
        standalone.push(run);
      }
    }

    const groups: TurnGroup[] = [];
    for (const turn of turns) {
      const turnRuns = (runsByTurn.get(turn.id) ?? []).sort(
        (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
      );
      groups.push({ key: turn.id, turn, runs: turnRuns, startedAt: turn.started_at });
    }
    for (const run of standalone) {
      groups.push({ key: run.id, turn: null, runs: [run], startedAt: run.started_at });
    }

    return groups.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [runs, turns]);

  const toggleRun = useCallback(async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);
    if (!stepsByRun[runId]) {
      setLoadingStepsFor(runId);
      const supabase = createClient();
      const { data } = await supabase
        .from('agent_activity_log')
        .select('id, run_id, step_type, step_number, title, status, input_excerpt, output_excerpt, error, started_at, ended_at')
        .eq('run_id', runId)
        .order('step_number', { ascending: true });
      setStepsByRun(prev => ({ ...prev, [runId]: (data as ActivityStep[]) ?? [] }));
      setLoadingStepsFor(null);
    }
  }, [expandedRun, stepsByRun]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader
          title="What it's actually doing."
          subtitle="Every chat turn, grouped and broken down step by step."
          note="A turn fired by a cron is tagged the same as one from a live chat message. Expand a turn to see its passes; expand a pass to see its steps; expand a step to see what it actually sent and got back."
          marginBottom="1.25rem"
        />

        {turnGroups.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>
              Nothing recorded yet — activity will show up here as soon as this agent runs.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {turnGroups.map(group => (
              <TurnCard
                key={group.key}
                group={group}
                expandedRun={expandedRun}
                onToggleRun={toggleRun}
                stepsByRun={stepsByRun}
                loadingStepsFor={loadingStepsFor}
                expandedStep={expandedStep}
                onToggleStep={(id) => setExpandedStep(prev => (prev === id ? null : id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
