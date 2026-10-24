// app/agents/[id]/crons/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAgentCtx } from '../layout';
import NewShiftModal from '@/components/shifts/NewShiftModal';
import ShiftHistoryRow from '@/components/shifts/ShiftHistoryRow';
import { useShiftsPanel } from '@/components/shifts/useShiftsPanel';
import ProjectHistoryRow from '@/components/projects/ProjectHistoryRow';
import { useProjectsPanel } from '@/components/projects/useProjectsPanel';
import type { Project } from '@/components/projects/types';
import type { ShiftRun } from '@/components/shifts/types';
import { createClient } from '@/lib/supabase/client';
import { RunChainBlock, TaskChainBlock } from '@/components/runsheet/ChainBlock';
import type { RunStatus } from '@/components/runsheet/types';
import { TabHeader, HeaderButton } from '@/components/agent-ui/TabHeader';

// ─── Task types (Task Execution System phase 2) ─────────────────────────────────
// Mirrors supabase/migrations/20260926000000_create_tasks_runsheet_foundation.sql
// + 20260926010000_tasks_agent_scoping.sql. Scoped per (agent, user), same
// as `chats` itself -- an owner sees every connected user's tasks for this
// agent, a member sees only their own (tasks_owner_admin / tasks_member_own
// RLS). Only 'pending' and 'cancelled' are actually reachable yet --
// 'planning'/'planned'/'running' start getting used once the planner +
// chain runner (phase 3) exist to drive those transitions. Editing/
// cancelling is only offered here while a task is still 'pending' -- once
// planning starts touching a task, this UI treats it as read-only rather
// than letting an edit race a plan.
//
// This tab used to also show the older `crons` table (a plain agent-
// scheduled reminder that fires by dropping a message into chat -- see
// bemain/crons.py) below the task list. Stripped out here by explicit
// decision: recurring work now belongs to a task with
// trigger_type='cron' (already supported below) instead of a separate
// mechanism, so the Runsheet is cleanly just the task list. The `crons`/
// `cron_runs` tables and bemain's create_cron/list_crons/cancel_cron
// tools still exist and still work -- they're just no longer surfaced
// here. Folding cron *creation* itself onto tasks (so create_cron stops
// being a separate tool) is follow-up backend work, not done in this
// pass.

type TaskTriggerType = 'immediate' | 'cron';
type TaskStatus = 'pending' | 'planning' | 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';

interface Task {
  id: string;
  agent_id: string;
  org_id: string;
  chat_id: string | null;
  created_by: string;
  definition: string;
  trigger_type: TaskTriggerType;
  cron_expression: string | null;
  next_run_at: string | null;
  status: TaskStatus;
  active_chain_id: string | null;
  run_count: number;
  last_run_at: string | null;
  last_error: string | null;
  // How the result is delivered: 'chat' = user-facing, 'none' = nothing is sent.
  delivery: 'chat' | 'notification' | 'none' | 'project';
  // Set when a project agent created the task as a step of its project: it belongs to that project, not to this list.
  project_id?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

type TaskDraft = { definition: string; trigger_type: TaskTriggerType; cron_expression: string };

// ─── Chain/run types (Task Execution System phases 3-4) ────────────────────────
// ─── History (Task Execution System, cron-engine follow-up) ───────────────────
// History is now run-level, not task-level: every task_runs row is its own
// row here (task name + that specific run's own node steps), across every
// task regardless of trigger_type -- a recurring cron task never itself
// leaves 'planned' (see task_cron_scheduler.py), so without this it would
// never show any execution history at all beyond a bare run_count. The one
// task-level exception is a task cancelled before it ever ran (the only way
// 'cancelled' happens -- Cancel is offered until the task starts running, planning included) -- it has no
// task_runs row to be represented by, so it's unioned in directly or it
// would silently vanish from the UI entirely once History stopped being
// task-status-filtered.

interface TaskRunRecord {
  id: string;
  task_id: string;
  chain_id: string | null;
  status: RunStatus;
  trigger_source: string;
  started_at: string;
  ended_at: string | null;
  tasks: {
    id: string;
    definition: string;
    trigger_type: TaskTriggerType;
    cron_expression: string | null;
  };
}

// A history entry is either one FINISHED run (completed or fully failed), or a
// task that ended without ever running (retired before it ran, or planning
// failed for good) -- it has no run row to be represented by.
type HistoryEntry =
  | { kind: 'run'; sortTime: string; run: TaskRunRecord }
  | { kind: 'task'; sortTime: string; task: Task }
  | { kind: 'shift_run'; sortTime: string; run: ShiftRun }
  | { kind: 'project'; sortTime: string; project: Project };

const HISTORY_PAGE_SIZE = 20;
// Only finished runs belong in History. A 'running' or 'stuck' (recovering) run
// is still in progress -- its task is on the Active tab until it finishes.
const FINISHED_RUN_STATUSES: RunStatus[] = ['completed', 'failed'];

// Merges a freshly fetched page into the loaded runs by id (a refresh of the
// newest page updates rows in place), newest first.
function mergeRuns(prev: TaskRunRecord[], incoming: TaskRunRecord[]): TaskRunRecord[] {
  const byId = new Map(prev.map(r => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return Array.from(byId.values()).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
}

// A left accent on every card says at a glance where the task is: brass while running,
// copper while a step is being repaired, red when it failed, green when it completed.
function cardAccent(status: TaskStatus | RunStatus | 'recovering'): string {
  if (status === 'running') return '#C9A24D';
  if (status === 'stuck' || status === 'recovering') return '#D9A06A';
  if (status === 'failed') return '#D9A196';
  if (status === 'completed') return '#8DBA9A';
  if (status === 'planning') return '#8FA3B2';
  return '#DAD5C5';
}

function cardStyle(accent: string): React.CSSProperties {
  return { background: '#fff', border: '1px solid #E2DFD3', borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: '1rem 1.25rem' };
}

function HistoryRow({ entry }: { entry: Exclude<HistoryEntry, { kind: 'shift_run' | 'project' }> }) {
  if (entry.kind === 'task') {
    const { task } = entry;
    return (
      <div style={cardStyle(cardAccent(task.status))}>
        <p style={{ fontSize: '0.88rem', color: '#26251E', margin: '0 0 0.5rem', lineHeight: 1.55, fontWeight: 400 }}>
          {task.definition}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <StatusChip status={task.status} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#9E9C8F' }}>
            Never ran
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#B9B4A2' }}>
            {formatDateTime(entry.sortTime)}
          </span>
          {task.status === 'failed' && task.last_error && (
            <span style={{ fontSize: '0.72rem', color: '#B34A3C', flexBasis: '100%', lineHeight: 1.5 }}>{task.last_error}</span>
          )}
        </div>
        <TaskChainBlock task={task} live={false} />
      </div>
    );
  }

  const { run } = entry;
  const task = run.tasks;
  return (
    <div style={cardStyle(cardAccent(run.status))}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '0.88rem', color: '#26251E', margin: '0 0 0.5rem', lineHeight: 1.55, fontWeight: 400 }}>
          {task.definition}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <StatusChip status={run.status} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#9E9C8F', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {task.trigger_type === 'immediate' ? 'Immediate' : `Cron · ${task.cron_expression}`}
          </span>
          {/* "immediate"/"cron" already say how the task is triggered (the chip above); only an unusual source (manual, recovery) adds anything. */}
          {run.trigger_source !== task.trigger_type && (
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#9E9C8F', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {run.trigger_source}
            </span>
          )}
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#B9B4A2' }}>
            {formatDateTime(run.started_at)}
          </span>
        </div>
      </div>
      <RunChainBlock run={run} taskId={run.task_id} />
    </div>
  );
}

const ACTIVE_STATUSES: TaskStatus[] = ['pending', 'planning', 'planned', 'running'];

// bemain's task_recovery_pipeline.py (`_GAVE_UP_PREFIX`) writes this at the start
// of tasks.last_error once it has spent every planning attempt on a task.
// It is the one signal that a planning failure is FINAL rather than still being
// retried automatically -- keep the two strings identical.
const PLANNING_GAVE_UP_PREFIX = "Couldn't plan this task after";

function planningGaveUp(t: Task): boolean {
  return t.status === 'failed' && (t.last_error ?? '').startsWith(PLANNING_GAVE_UP_PREFIX);
}

// The Active & scheduled tab is task-level and holds everything NOT finished:
// waiting, planning, scheduled, running -- and a task in recovery, because its
// task status stays 'running' while a failed step is being repaired and
// resumed. A 'failed' task is also still live (and so stays here) while its
// planning is being retried automatically, or if it is a recurring task the
// scheduler still fires. Only FULLY finished work goes to History: completed
// runs, fully failed runs, and tasks that were retired or could never be planned.
function isActiveTask(t: Task): boolean {
  if (t.project_id) return false;
  if (ACTIVE_STATUSES.includes(t.status)) return true;
  if (t.status !== 'failed' || planningGaveUp(t)) return false;
  return t.trigger_type === 'cron' || !t.active_chain_id;
}

// A task with no run row that still belongs in History.
function isNeverRanHistoryTask(t: Task): boolean {
  if (t.project_id) return false;
  return t.run_count === 0 && (t.status === 'cancelled' || planningGaveUp(t));
}

// Same light shape guard the DB's tasks_cron_expression_shape check applies
// -- this only catches obviously malformed input before a round trip; it is
// not a real cron parser (see the migration's own comment on why one isn't
// written in SQL, and why full evaluation belongs to the phase 3 scheduler).
const CRON_SHAPE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function Spinner({ size = 20, color = '#26251E' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusColor(status: TaskStatus | 'stuck'): { fg: string; bg: string; border: string } {
  if (status === 'stuck') return { fg: '#A17F3A', bg: '#EFE4C9', border: '#E4D2A0' };
  if (status === 'failed') return { fg: '#B34A3C', bg: '#F5E6E1', border: '#E3C4BB' };
  if (status === 'planning' || status === 'planned' || status === 'running') return { fg: '#A17F3A', bg: '#EFE4C9', border: '#E4D2A0' };
  if (status === 'completed') return { fg: '#26251E', bg: '#EDEBE2', border: '#E2DFD3' };
  if (status === 'cancelled') return { fg: '#9E9C8F', bg: '#F0EEE5', border: '#E2DFD3' };
  return { fg: '#67655A', bg: '#F0EEE5', border: '#DFDBCB' }; // pending
}

function statusLabel(status: TaskStatus | 'stuck'): string {
  if (status === 'stuck') return 'Recovering';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function StatusChip({ status }: { status: TaskStatus | 'stuck' }) {
  const c = statusColor(status);
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.63rem', letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '0.15rem 0.5rem', borderRadius: 3, color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {statusLabel(status)}
    </span>
  );
}

// ─── Task Form (shared shape for create/edit) ─────────────────────────────────

function TaskForm({ draft, onChange, cronError }: {
  draft: TaskDraft;
  onChange: (next: TaskDraft) => void;
  cronError: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <div>
        <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
          Task definition <span style={{ color: '#B34A3C' }}>*</span>
        </label>
        <textarea
          className="task-input"
          placeholder="e.g. Send a detailed report of yesterday's sales and collections across all locations"
          value={draft.definition}
          onChange={e => onChange({ ...draft, definition: e.target.value })}
          maxLength={2000}
          rows={4}
          style={{ resize: 'none', lineHeight: 1.6 }}
        />
        <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
          {draft.definition.length}/2000
        </p>
      </div>

      <div>
        <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Trigger
        </label>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          {(['immediate', 'cron'] as TaskTriggerType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...draft, trigger_type: t })}
              style={{
                flex: 1, padding: '0.55rem 0.75rem', fontSize: '0.82rem', fontFamily: "'Inter', sans-serif",
                border: `1px solid ${draft.trigger_type === t ? '#26251E' : '#DAD5C5'}`,
                background: draft.trigger_type === t ? '#26251E' : 'transparent',
                color: draft.trigger_type === t ? '#F7F6F2' : '#3A3830',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              {t === 'immediate' ? 'Immediate' : 'Recurring (cron)'}
            </button>
          ))}
        </div>
      </div>

      {draft.trigger_type === 'cron' && (
        <div>
          <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Cron expression <span style={{ color: '#B34A3C' }}>*</span>
          </label>
          <input
            className="task-input"
            type="text"
            placeholder="0 8 * * *"
            value={draft.cron_expression}
            onChange={e => onChange({ ...draft, cron_expression: e.target.value })}
            maxLength={120}
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          />
          <p style={{ fontSize: '0.72rem', color: cronError ? '#B34A3C' : '#9E9C8F', margin: '0.35rem 0 0', lineHeight: 1.5 }}>
            {cronError || 'Standard 5-field cron expression (minute hour day month weekday) — e.g. "0 8 * * *" for daily at 8am. A recurring task can’t run more often than the plan’s shortest interval (shown on the Agent Profile); a faster one is cancelled with a note.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Create Task Modal ─────────────────────────────────────────────────────────

function CreateTaskModal({ agentId, orgId, userId, onClose, onCreated }: {
  agentId: string;
  orgId: string;
  userId: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({ definition: '', trigger_type: 'immediate', cron_expression: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cronError, setCronError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const validate = (): boolean => {
    if (!draft.definition.trim()) { setError('A task definition is required.'); return false; }
    if (draft.trigger_type === 'cron') {
      if (!draft.cron_expression.trim()) { setCronError('A cron expression is required for a recurring task.'); return false; }
      if (!CRON_SHAPE.test(draft.cron_expression.trim())) { setCronError('Expected 5 space-separated fields (minute hour day month weekday).'); return false; }
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    setCronError('');
    if (!validate()) return;

    setLoading(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from('tasks')
      .insert({
        agent_id: agentId,
        org_id: orgId,
        created_by: userId,
        definition: draft.definition.trim(),
        trigger_type: draft.trigger_type,
        cron_expression: draft.trigger_type === 'cron' ? draft.cron_expression.trim() : null,
        // A task made here was asked for by a person, so its result is delivered to
        // them: a recurring (cron) task onto the agent's notification feed (the planner
        // ends the chain with push_notification), a one-off straight into their chat
        // (submit_to_chat). The chat is for conversation, not an hourly job's output.
        delivery: draft.trigger_type === 'cron' ? 'notification' : 'chat',
      })
      .select()
      .single();

    setLoading(false);
    if (dbError) {
      // The database refuses a recurring task past the plan's limit with a message written for the person to read.
      setError(dbError.message.startsWith('Recurring task limit reached') ? dbError.message : 'Something went wrong. Please try again.');
      return;
    }
    onCreated(data as Task);
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.15s ease both',
      }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 480, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>New task</p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>Add to this agent&apos;s tasks</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <TaskForm draft={draft} onChange={next => { setDraft(next); setCronError(''); }} cronError={cronError} />

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !draft.definition.trim()}
            style={{
              background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem',
              fontFamily: "'Inter', sans-serif", cursor: loading || !draft.definition.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: !draft.definition.trim() ? 0.5 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading && <Spinner size={14} color="#fff" />}
            {loading ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Task Modal ────────────────────────────────────────────────────────────

function EditTaskModal({ task, onClose, onSaved }: {
  task: Task;
  onClose: () => void;
  onSaved: (draft: TaskDraft) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    definition: task.definition, trigger_type: task.trigger_type, cron_expression: task.cron_expression ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cronError, setCronError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const validate = (): boolean => {
    if (!draft.definition.trim()) { setError('A task definition is required.'); return false; }
    if (draft.trigger_type === 'cron') {
      if (!draft.cron_expression.trim()) { setCronError('A cron expression is required for a recurring task.'); return false; }
      if (!CRON_SHAPE.test(draft.cron_expression.trim())) { setCronError('Expected 5 space-separated fields (minute hour day month weekday).'); return false; }
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    setCronError('');
    if (!validate()) return;

    setLoading(true);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from('tasks')
      .update({
        definition: draft.definition.trim(),
        trigger_type: draft.trigger_type,
        cron_expression: draft.trigger_type === 'cron' ? draft.cron_expression.trim() : null,
      })
      .eq('id', task.id);

    setLoading(false);
    if (dbError) {
      setError('Something went wrong. Please try again.');
      return;
    }
    onSaved(draft);
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.15s ease both',
      }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 480, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>Edit task</p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>Update this task</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <TaskForm draft={draft} onChange={next => { setDraft(next); setCronError(''); }} cronError={cronError} />

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !draft.definition.trim()}
            style={{
              background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem',
              fontFamily: "'Inter', sans-serif", cursor: loading || !draft.definition.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: !draft.definition.trim() ? 0.5 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading && <Spinner size={14} color="#fff" />}
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cancel Task Confirm ────────────────────────────────────────────────────────

function CancelTaskModal({ task, onClose, onCancelled }: {
  task: Task;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Same action (status -> 'cancelled') whether this is a never-run task
  // being dismissed pre-planning or an already-planned/recurring task
  // being retired -- only the copy differs, since "cancel" reads oddly
  // for a task that's already run N times. Never touches task_runs/
  // task_run_steps -- retiring a task leaves its past run history in
  // History exactly as it was.
  const isRetire = task.run_count > 0;

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    const supabase = createClient();
    // Soft delete only -- the row stays for history/audit, never a hard
    // delete (keeps FK-referencing chains/runs from ever pointing at a
    // vanished row).
    // Only while the task hasn't started running -- a run already underway is left to finish.
    const { data: updated, error: dbError } = await supabase
      .from('tasks')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', task.id)
      .in('status', ['pending', 'planning', 'planned', 'failed'])
      .select('id');

    setLoading(false);
    if (dbError) { setError('Something went wrong. Please try again.'); return; }
    if (!updated || updated.length === 0) { setError('This task has just started running, so it can’t be cancelled now. It will finish on its own.'); return; }
    onCancelled();
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.15s ease both',
      }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '1.75rem', width: '100%', maxWidth: 420, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 500, letterSpacing: '-0.02em', color: '#26251E', margin: '0 0 0.6rem' }}>
          {isRetire ? 'Retire this task?' : 'Cancel this task?'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#67655A', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
          &ldquo;{task.definition.length > 120 ? task.definition.slice(0, 120) + '…' : task.definition}&rdquo;{' '}
          {isRetire
            ? `won't run again. Its ${task.run_count} past run${task.run_count === 1 ? '' : 's'} stay in History, untouched.`
            : "will move to History and won't run."}
        </p>
        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0 0 1rem', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>Keep task</button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              background: '#B34A3C', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem',
              fontFamily: "'Inter', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 4,
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}
          >
            {loading && <Spinner size={14} color="#fff" />}
            {loading ? (isRetire ? 'Retiring…' : 'Cancelling…') : (isRetire ? 'Retire task' : 'Cancel task')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reschedule Modal (schedule-only edit, once a cron task is past
// 'pending' -- see task_cron_scheduler.py's reschedule_cron_task for why
// only the schedule, never the definition, is safe to touch here) ─────────────

function RescheduleModal({ task, onClose, onSaved }: {
  task: Task;
  onClose: () => void;
  onSaved: (cronExpression: string) => void;
}) {
  const [cronExpression, setCronExpression] = useState(task.cron_expression ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    setError('');
    const trimmed = cronExpression.trim();
    if (!trimmed) { setError('A cron expression is required.'); return; }
    if (!CRON_SHAPE.test(trimmed)) { setError('Expected 5 space-separated fields (minute hour day month weekday).'); return; }

    setLoading(true);
    try {
      const resp = await fetch(`/api/tasks/${task.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron_expression: trimmed }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      onSaved(trimmed);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.15s ease both',
      }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 440, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>Edit schedule</p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>When this task runs</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#67655A', lineHeight: 1.6, margin: '0 0 1rem' }}>
          The task itself already ran once and can&apos;t be re-planned here — only its schedule can be fixed. Takes effect immediately.
        </p>

        <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
          Cron expression <span style={{ color: '#B34A3C' }}>*</span>
        </label>
        <input
          className="task-input"
          type="text"
          placeholder="0 8 * * *"
          value={cronExpression}
          onChange={e => { setCronExpression(e.target.value); setError(''); }}
          maxLength={120}
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        />
        <p style={{ fontSize: '0.72rem', color: error ? '#B34A3C' : '#9E9C8F', margin: '0.35rem 0 0', lineHeight: 1.5 }}>
          {error || 'Standard 5-field cron expression (minute hour day month weekday) — e.g. "*/2 * * * *" for every 2 minutes.'}
        </p>

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !cronExpression.trim()}
            style={{
              background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem',
              fontFamily: "'Inter', sans-serif", cursor: loading || !cronExpression.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: !cronExpression.trim() ? 0.5 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading && <Spinner size={14} color="#fff" />}
            {loading ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Row ───────────────────────────────────────────────────────────────────

function TaskRow({ task, recovering, onEdit, onEditSchedule, onCancel, onRun, running }: {
  task: Task; recovering: boolean; onEdit: () => void; onEditSchedule: () => void; onCancel: () => void; onRun: () => void; running: boolean;
}) {
  const canModify = task.status === 'pending';
  const canRun = (task.status === 'planned' || task.status === 'failed') && !!task.active_chain_id;
  // A failed task with no chain failed while PLANNING -- there is nothing to run (a recurring one is re-planned automatically on its next scheduled tick), but it can still be retired.
  const planningFailed = task.status === 'failed' && !task.active_chain_id;
  // Once past 'pending' the chain is already built for this task's
  // definition -- editing that without re-planning (not built) would
  // silently leave the chain doing something else, so only a recurring
  // task's own schedule stays safe to fix here (task_cron_scheduler.py's
  // reschedule_cron_task -- never the definition, never task_runs).
  // Retiring (the same 'cancelled' status the pre-planning Cancel already
  // uses) is available from the same at-rest states Run is, for either
  // trigger type -- a task doesn't have to be re-run just to be dismissed.
  const canEditSchedule = (canRun || planningFailed) && task.trigger_type === 'cron';
  // A task still being planned can be stopped too: the backend only writes its plan back if the task is still 'planning', so a cancel always wins. A task that is already running is left to finish.
  const planning = task.status === 'planning';
  const canRetire = canRun || planningFailed || planning;
  // Why this task last failed (recorded by the backend's recovery engine once
  // it has given up -- planning attempts or repair rounds spent). A recurring
  // task whose last run failed sits at 'planned' (it fires again on schedule),
  // so the note applies there too, not just to 'failed'.
  const failureNote = (task.status === 'failed' || task.status === 'planned')
    ? (task.last_error ?? (planningFailed ? 'Couldn’t plan this task.' : null))
    : null;
  // A task whose planning failed but is still being retried automatically.
  const retryingPlanning = planningFailed && !planningGaveUp(task);

  return (
    <div style={cardStyle(cardAccent(task.status === 'running' && recovering ? 'recovering' : task.status))}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '0.88rem', color: '#26251E', margin: '0 0 0.5rem', lineHeight: 1.55, fontWeight: 400 }}>
            {task.definition}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* While a failed step is being repaired the task status is still
                'running' -- the run underneath is what says it's recovering. */}
            <StatusChip status={task.status === 'running' && recovering ? 'stuck' : task.status} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#9E9C8F', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {task.trigger_type === 'immediate' ? 'Immediate' : `Cron · ${task.cron_expression}`}
            </span>
            {task.run_count > 0 && (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#9E9C8F' }}>
                {task.run_count} run{task.run_count === 1 ? '' : 's'}
              </span>
            )}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#B9B4A2' }}>
              {formatDateTime(task.created_at)}
            </span>
            {failureNote && (
              <span style={{ fontSize: '0.72rem', color: '#B34A3C', flexBasis: '100%', lineHeight: 1.5 }}>
                {failureNote}{retryingPlanning ? ' Retrying automatically.' : ''}
              </span>
            )}
          </div>
        </div>
        {(canModify || canRun || planningFailed || planning) && (
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            {canRun && (
              <button
                onClick={onRun} disabled={running}
                style={{ background: '#26251E', border: 'none', color: '#F7F6F2', padding: '0.3rem 0.65rem', fontSize: '0.72rem', fontFamily: "'Inter', sans-serif", cursor: running ? 'not-allowed' : 'pointer', borderRadius: 4, opacity: running ? 0.6 : 1 }}
              >
                {running ? 'Starting…' : task.status === 'failed' ? 'Run again' : 'Run'}
              </button>
            )}
            {canModify && (
              <button onClick={onEdit} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.72rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>Edit</button>
            )}
            {canEditSchedule && (
              <button onClick={onEditSchedule} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.72rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>Edit schedule</button>
            )}
            {(canModify || canRetire) && (
              <button onClick={onCancel} style={{ background: 'none', border: '1px solid #E3C4BB', color: '#B34A3C', padding: '0.3rem 0.65rem', fontSize: '0.72rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
                {task.run_count > 0 ? 'Retire' : 'Cancel'}
              </button>
            )}
          </div>
        )}
      </div>
      <TaskChainBlock task={task} recovering={recovering} />
    </div>
  );
}

// ─── Tasks section (new) ────────────────────────────────────────────────────────

function TasksSection({ agentId, orgId }: { agentId: string; orgId: string }) {
  const { role } = useAgentCtx();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [historyRuns, setHistoryRuns] = useState<TaskRunRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [reschedulingTask, setReschedulingTask] = useState<Task | null>(null);
  const [cancellingTask, setCancellingTask] = useState<Task | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  // Shifts (owner only) share the Active list and the History with the tasks.
  const shifts = useShiftsPanel(agentId, true);     // every person's Runsheet lists their OWN shifts (owner or connected user)
  // Projects (each person's own) share the Active list and the History too.
  const projects = useProjectsPanel(agentId);

  useEffect(() => {
    if (!agentId) return;
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }

      // Everyone, the agent's owner included, sees only the tasks they requested themselves. An owner's RLS would let
      // them read every connected user's tasks; this tab deliberately doesn't (what connected people ask of the agent is
      // theirs). The Add Users tab shows the owner how much scheduled work each person has, as counts only.
      // Completed tasks are never listed here (their runs are in History), so they aren't loaded -- the list would
      // otherwise grow without bound.
      const { data } = await supabase.from('tasks').select('*').eq('agent_id', agentId).eq('created_by', uid)
        .neq('status', 'completed').order('created_at', { ascending: false });
      if (cancelled) return;
      setTasks((data as Task[]) ?? []);
      setLoading(false);

      // The realtime feed carries every task the viewer's RLS allows (for an owner, everyone's): keep only their own.
      const mine = (t: Task) => t.created_by === uid;
      channel = supabase
        .channel(`agent-tasks:${agentId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `agent_id=eq.${agentId}` }, payload => {
          if (cancelled) return;
          if (payload.eventType === 'INSERT') {
            const next = payload.new as Task;
            if (mine(next)) setTasks(prev => prev.some(t => t.id === next.id) ? prev : [next, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const next = payload.new as Task;
            if (mine(next)) setTasks(prev => prev.map(t => t.id === next.id ? next : t));
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== (payload.old as Task).id));
          }
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [agentId]);

  // ── History: finished runs only, newest first, 20 at a time ──────────────
  // Keyset pagination on started_at (stable while new runs arrive, unlike an
  // offset). Only completed / fully-failed runs are listed -- a running or
  // recovering run is still on the Active tab. Older pages are appended as the
  // list is scrolled (sentinel below); a task changing only refreshes the
  // newest page and merges it in, so already-loaded older pages are kept.
  const historyBaseQuery = useCallback(() => {
    const supabase = createClient();
    let query = supabase
      .from('task_runs')
      .select('id, task_id, chain_id, status, trigger_source, started_at, ended_at, tasks!inner(id, definition, trigger_type, cron_expression, agent_id, created_by)')
      .eq('tasks.agent_id', agentId)
      .in('status', FINISHED_RUN_STATUSES);
    if (userId) query = query.eq('tasks.created_by', userId);
    return query;
  }, [agentId, userId]);

  useEffect(() => {
    if (!agentId || !userId) return;       // history is the viewer's own: wait until we know who that is
    let cancelled = false;
    (async () => {
      const { data } = await historyBaseQuery().order('started_at', { ascending: false }).limit(HISTORY_PAGE_SIZE);
      if (cancelled) return;
      const page = (data as unknown as TaskRunRecord[]) ?? [];
      setHistoryRuns(prev => mergeRuns(prev, page));
      // Only the FIRST load decides whether more exist; a later refresh of the
      // newest page must not flip an already-known "more pages" answer.
      setHistoryHasMore(prev => (historyLoading ? page.length === HISTORY_PAGE_SIZE : prev));
      setHistoryLoading(false);
    })();
    return () => { cancelled = true; };
    // `tasks` changing (a run started/finished/recovered) refreshes the newest page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, userId, tasks]);

  const shiftHistory = shifts.history;
  const shiftLoadMore = shiftHistory.loadMore;
  const loadMoreHistory = useCallback(async () => {
    if (historyLoadingMore) return;
    setHistoryLoadingMore(true);
    try {
      // Each source pages on its own cursor; the list below only shows what is newer than the
      // oldest entry of any source that still has more, so the order stays chronological.
      if (historyHasMore && historyRuns.length > 0) {
        const cursor = historyRuns[historyRuns.length - 1].started_at;
        const { data } = await historyBaseQuery().lt('started_at', cursor).order('started_at', { ascending: false }).limit(HISTORY_PAGE_SIZE);
        const page = (data as unknown as TaskRunRecord[]) ?? [];
        setHistoryRuns(prev => mergeRuns(prev, page));
        setHistoryHasMore(page.length === HISTORY_PAGE_SIZE);
      }
      await shiftLoadMore();
    } finally {
      setHistoryLoadingMore(false);
    }
  }, [historyBaseQuery, historyHasMore, historyLoadingMore, historyRuns, shiftLoadMore]);
  const anyHistoryMore = historyHasMore || shiftHistory.hasMore;

  // Infinite scroll: load the next 20 when the sentinel at the end of the list
  // scrolls into view.
  const historySentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = historySentinelRef.current;
    if (tab !== 'history' || !node || !anyHistoryMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) void loadMoreHistory();
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab, anyHistoryMore, loadMoreHistory, historyRuns.length, shiftHistory.runs.length]);

  // Tasks whose current run is being repaired/resumed by the recovery engine:
  // the task row stays 'running', the run underneath is 'stuck'. Re-checked
  // whenever a task row changes (a run ending stuck, or a resumed one
  // finishing, both touch the task row).
  const [recoveringTaskIds, setRecoveringTaskIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const runningIds = tasks.filter(t => t.status === 'running').map(t => t.id);
    // Nothing running -> nothing to look up. A stale entry is harmless: the row
    // only honors it while its task status is 'running'.
    if (runningIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('task_runs').select('task_id').in('task_id', runningIds).eq('status', 'stuck');
      if (!cancelled) setRecoveringTaskIds(new Set(((data as { task_id: string }[]) ?? []).map(r => r.task_id)));
    })();
    return () => { cancelled = true; };
  }, [tasks]);

  // History entries: the loaded finished runs, plus tasks that ended without
  // ever running (retired before running, or planning failed for good). Those
  // few come from `tasks` (already loaded); they are merged in only down to the
  // oldest run loaded so far, so scrolling stays chronological and an old
  // never-ran task doesn't jump to the top before its neighbours are loaded.
  const oldestTaskRun = historyHasMore && historyRuns.length > 0 ? new Date(historyRuns[historyRuns.length - 1].started_at).getTime() : -Infinity;
  const oldestShiftRun = shiftHistory.hasMore && shiftHistory.runs.length > 0 ? new Date(shiftHistory.runs[shiftHistory.runs.length - 1].window_start).getTime() : -Infinity;
  const oldestLoadedRunTime = Math.max(oldestTaskRun, oldestShiftRun);
  const historyEntries: HistoryEntry[] = [
    ...historyRuns.map(run => ({ kind: 'run' as const, sortTime: run.started_at, run })),
    ...shiftHistory.runs.map(run => ({ kind: 'shift_run' as const, sortTime: run.window_start, run })).filter(e => new Date(e.sortTime).getTime() >= oldestLoadedRunTime),
    ...tasks.filter(isNeverRanHistoryTask).map(task => ({
      kind: 'task' as const, sortTime: task.completed_at ?? task.updated_at, task,
    })).filter(e => new Date(e.sortTime).getTime() >= oldestLoadedRunTime),
    ...projects.history.map(project => ({ kind: 'project' as const, sortTime: project.ended_at ?? project.ends_at, project })).filter(e => new Date(e.sortTime).getTime() >= oldestLoadedRunTime),
  ].filter(e => e.kind !== 'run' || new Date(e.sortTime).getTime() >= oldestLoadedRunTime).sort((a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime());

  const handleTaskCreated = (task: Task) => {
    // The realtime INSERT event usually lands first (the task is already in the
    // list by the time the create call resolves) -- so this must not add it a
    // second time, or the same task shows as duplicate cards until a refresh.
    setTasks(prev => [task, ...prev.filter(t => t.id !== task.id)]);
    setShowCreateModal(false);
    setTab('active');
  };

  const handleTaskSaved = (draft: TaskDraft) => {
    if (!editingTask) return;
    setTasks(prev => prev.map(t => t.id === editingTask.id
      ? { ...t, definition: draft.definition.trim(), trigger_type: draft.trigger_type, cron_expression: draft.trigger_type === 'cron' ? draft.cron_expression.trim() : null }
      : t));
    setEditingTask(null);
  };

  const handleTaskCancelled = () => {
    if (!cancellingTask) return;
    setTasks(prev => prev.map(t => t.id === cancellingTask.id ? { ...t, status: 'cancelled' as TaskStatus } : t));
    setCancellingTask(null);
  };

  const handleTaskRescheduled = (cronExpression: string) => {
    if (!reschedulingTask) return;
    setTasks(prev => prev.map(t => t.id === reschedulingTask.id ? { ...t, cron_expression: cronExpression } : t));
    setReschedulingTask(null);
  };

  const handleRun = async (task: Task) => {
    setRunningTaskId(task.id);
    try {
      await fetch(`/api/tasks/${task.id}/run`, { method: 'POST' });
      // No optimistic status update -- the task row's own realtime
      // subscription (tasks table, already enabled) picks up 'running'
      // then 'completed'/'failed'/'planned' as the backend actually
      // writes them; this just clears the button's own busy state once
      // the request has been accepted.
    } finally {
      setRunningTaskId(null);
    }
  };

  const activeTasks = tasks.filter(isActiveTask);
  // One list for everything that is alive: working now, then planning, then by when it next runs.
  const activeEntries = [
    ...activeTasks.map(task => {
      const running = task.status === 'running';
      const planning = task.status === 'pending' || task.status === 'planning';
      return {
        key: `task-${task.id}`, rank: running ? 0 : planning ? 1 : 2,
        at: task.next_run_at ? new Date(task.next_run_at).getTime() : Number.MAX_SAFE_INTEGER,
        node: (
          <TaskRow
            task={task} recovering={recoveringTaskIds.has(task.id)}
            onEdit={() => setEditingTask(task)} onEditSchedule={() => setReschedulingTask(task)}
            onCancel={() => setCancellingTask(task)}
            onRun={() => handleRun(task)} running={runningTaskId === task.id}
          />
        ),
      };
    }),
    ...shifts.activeEntries,
    ...projects.activeEntries,
  ].sort((a, b) => a.rank - b.rank || a.at - b.at);

  if (loading) {
    return <div style={{ padding: '2rem 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  }

  return (
    <div>
      <style>{`
        .task-input {
          width: 100%; padding: 0.6rem 0.75rem; font-size: 0.875rem;
          font-family: 'Inter', sans-serif; color: #26251E; background: #F7F6F2;
          border: 1px solid #DAD5C5; border-radius: 4px; outline: none;
          transition: border-color 0.15s; box-sizing: border-box;
        }
        .task-input:focus { border-color: #26251E; }
        .task-input::placeholder { color: #9E9C8F; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <TabHeader
        title="What's queued for this agent."
        subtitle={role === 'owner'
          ? 'Tasks and shifts set up for this agent, created here or by the agent itself in chat.'
          : 'Tasks you’ve requested of this agent, created here or by the agent itself in chat.'}
        note={role === 'owner' ? 'What people connected to this agent ask of it stays with them, on their own Runsheet.' : undefined}
        actions={userId ? (
          <>
            {role === 'owner' && <HeaderButton variant="outline" plus onClick={() => setShowShiftModal(true)}>New shift</HeaderButton>}
            <HeaderButton plus onClick={() => setShowCreateModal(true)}>New task</HeaderButton>
          </>
        ) : undefined}
      />

      <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid #E2DFD3', marginBottom: '1.25rem' }}>
        {(['active', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0.65rem',
              fontSize: '0.82rem', fontFamily: "'Inter', sans-serif",
              color: tab === t ? '#26251E' : '#9E9C8F',
              borderBottom: tab === t ? '2px solid #26251E' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t === 'active' ? 'Active & scheduled' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'active' ? (
        activeEntries.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '2.5rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>
              Nothing queued yet — add a task or ask the agent in chat.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {activeEntries.map(entry => <div key={entry.key}>{entry.node}</div>)}
          </div>
        )
      ) : historyLoading || shiftHistory.loading ? (
        <div style={{ padding: '1.5rem 0', display: 'flex', justifyContent: 'center' }}><Spinner size={18} /></div>
      ) : historyEntries.length === 0 ? (
        <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '2.5rem 2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No history yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {historyEntries.map(entry => entry.kind === 'shift_run'
            ? <ShiftHistoryRow key={entry.run.id} run={entry.run} shift={shifts.shiftById(entry.run.shift_id)} onOpen={() => shifts.openRun(entry.run)} />
            : entry.kind === 'project'
              ? <ProjectHistoryRow key={entry.project.id} project={entry.project} />
              : <HistoryRow key={entry.kind === 'run' ? entry.run.id : entry.task.id} entry={entry} />)}
          {anyHistoryMore && (
            <div ref={historySentinelRef} style={{ padding: '0.75rem 0', display: 'flex', justifyContent: 'center', minHeight: 24 }}>
              {historyLoadingMore && <Spinner size={16} />}
            </div>
          )}
        </div>
      )}

      {shifts.dialogs}
      {projects.dialogs}
      {showShiftModal && userId && (
        <NewShiftModal agentId={agentId} orgId={orgId} userId={userId} onClose={() => setShowShiftModal(false)} onCreated={() => setShowShiftModal(false)} />
      )}
      {showCreateModal && userId && (
        <CreateTaskModal agentId={agentId} orgId={orgId} userId={userId} onClose={() => setShowCreateModal(false)} onCreated={handleTaskCreated} />
      )}
      {editingTask && (
        <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} onSaved={handleTaskSaved} />
      )}
      {reschedulingTask && (
        <RescheduleModal task={reschedulingTask} onClose={() => setReschedulingTask(null)} onSaved={handleTaskRescheduled} />
      )}
      {cancellingTask && (
        <CancelTaskModal task={cancellingTask} onClose={() => setCancellingTask(null)} onCancelled={handleTaskCancelled} />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// "Runsheet" tab (agents/[id]/crons route, renamed 2026-09-17 from "Crons").
// Now cleanly just the task list -- see the note above Task types for what
// used to also live here.

export default function CronsPage() {
  const { agentId, agent } = useAgentCtx();
  const orgId = agent?.org_id ?? null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {agentId && orgId && <TasksSection agentId={agentId} orgId={orgId} />}
      </div>
    </div>
  );
}
