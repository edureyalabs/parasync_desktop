// components/shifts/types.ts
// Shapes of the shift tables (supabase/migrations/20261006000000_shifts.sql). Read-only on the
// client except `shifts` itself (insert, retire); the engine in bemain writes the rest.

export type ShiftStatus = 'pending' | 'planning' | 'planned' | 'failed' | 'cancelled';
export type RunStatus = 'scheduled' | 'active' | 'ended' | 'terminated';
export type Outcome = 'completed' | 'partial' | 'failed';
export type RowKind = 'scheduled' | 'cron_wake' | 'failure_wake' | 'self_wake' | 'learning_wake';
export type RowStatus = 'scheduled' | 'running' | 'done' | 'failed' | 'skipped';

export interface ShiftSpec {
  version: number;
  timezone: string;
  days?: number[];
  start_time: string;
  end_time: string;
  wakes: { time: string; note?: string }[];
  wake_source: 'user' | 'default';
  goal: string;
  brief: string;
  report_instructions: string;
  tool_notes?: { tool: string; use: string }[];
  assumptions?: string[];
}

/** One change the owner asked for to a shift's plan (shifts.plan_feedback). applied_at is set once a plan that took it into account was saved. */
export interface PlanRequest { id: string; text: string; at: string; applied_at: string | null }

export interface Shift {
  id: string;
  org_id: string;
  agent_id: string;
  created_by: string;
  name: string;
  definition: string;
  report_instructions: string | null;
  status: ShiftStatus;
  spec: ShiftSpec | null;
  last_error: string | null;
  plan_attempts?: number;
  plan_feedback?: PlanRequest[];
  /** learning = the agent is still learning the shift (or went back to it); ready = it works from its SOP */
  sop_status?: 'learning' | 'ready';
  arena_state?: 'pending' | 'running' | 'done' | 'gave_up';
  /** The pre-run learning pass: how many have been tried, when it was asked for and its last sign of life. */
  arena_passes?: number;
  arena_requested_at?: string | null;
  arena_heartbeat_at?: string | null;
  /** Why the shift went back to learning mode (an escalation), when it did. */
  learn_note?: { reason?: string; unknown?: string; pending?: string; auto?: boolean } | null;
  next_start_at: string | null;
  created_at: string;
  retired_at: string | null;
}

export interface OpenItem { key: string; status: string; detail?: string; since?: string; due?: string }

export interface ShiftRun {
  id: string;
  shift_id: string;
  run_date: string;
  window_start: string;
  window_end: string;
  status: RunStatus;
  outcome: Outcome | null;
  outcome_note: string | null;
  report_submitted: boolean;
  report: { outcome: Outcome; headline: string; body: string } | null;
  handoff: { note?: string; open_items?: OpenItem[] } | null;
  running_report: string;
  spec_snapshot: ShiftSpec;
  started_at: string | null;
  ended_at: string | null;
}

export interface ShiftRow {
  id: string;
  shift_run_id: string;
  row_no: number;
  kind: RowKind;
  label: string;
  scheduled_for: string;
  is_final: boolean;
  status: RowStatus;
  wake_reason: { kind?: string; reason?: string; note?: string; error?: string } | null;
  decision: { why?: string; terminator?: string; work_steps?: number; cron?: { every_minutes: number; max_runs: number }; cron_not_registered?: string } | null;
  terminator: 'yield' | 'cron' | 'report' | null;
  iterations_used: number;
  error: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface ShiftStep {
  id: string;
  row_id: string;
  node_id: string | null;
  step_number: number;
  node_type: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  output_excerpt: string | null;
  error: string | null;
}

export interface ShiftNode { id: string; row_id: string; step_number: number; node_type: string; config: Record<string, unknown> }

export interface ShiftCron {
  id: string;
  shift_run_id: string;
  created_by_row_id: string | null;
  every_minutes: number;
  max_runs: number;
  runs_done: number;
  expires_at: string;
  status: 'active' | 'woke' | 'exhausted' | 'expired' | 'cancelled' | 'failed';
  created_at: string;
}

export interface ShiftTick { id: string; cron_id: string; tick_no: number; at: string; status: 'ok' | 'woke' | 'failed' | 'skipped'; outcome: string | null; reason: string | null; error: string | null }

export type PlannerOutcome = 'plan_accepted' | 'plan_rejected' | 'no_tool_call' | 'shift_rejected' | 'llm_failed' | 'unknown_tool' | 'explored';

export interface PlannerStep {
  id: string;
  shift_id: string;
  attempt: number;
  step_number: number;
  step_type: 'context' | 'turn';
  outcome: PlannerOutcome | null;
  title: string;
  status: 'running' | 'completed' | 'failed';
  detail: Record<string, unknown> | null;
  started_at: string;
  ended_at: string | null;
}

export type AgentStepKind = 'context' | 'node' | 'unnode' | 'handoff' | 'report' | 'finish' | 'cron' | 'submit' | 'look' | 'rejected' | 'no_call' | 'llm_failed' | 'wake' | 'routine';

// One decision the runner agent made inside a wake (shift_row_agent_steps).
export interface AgentStep {
  id: string;
  row_id: string;
  step_number: number;
  kind: AgentStepKind;
  tool: string | null;
  ok: boolean;
  counted: boolean;
  arguments: Record<string, unknown> | null;
  result: string | null;
  created_at: string;
}

/** The SOP the shift's agent writes for itself (shift_sops): six sections and a note per tool. */
export interface SopContent {
  sections: { overview: string; constraints: string; recipes: string; pitfalls: string; playbook: string; open_questions: string };
  tool_notes: Record<string, string>;
}

/** One saved version of the SOP, with who made the change, why, and what proved it. */
export interface SopVersion {
  id: string;
  shift_id: string;
  version: number;
  content: SopContent;
  change: string;
  reason: string;
  evidence: string;
  edited_by: 'learner' | 'runner' | 'owner';
  edited_in: string;
  created_at: string;
}

/** One step of a shift's pre-run learning pass (shift_arena_steps): a look at a tool or system, a refused call, the briefing it was given. */
export interface ArenaStep {
  id: string;
  shift_id: string;
  pass_no: number;
  step_number: number;
  kind: string;
  tool: string | null;
  ok: boolean;
  counted: boolean;
  arguments: unknown;
  result: unknown;
  created_at: string;
}
