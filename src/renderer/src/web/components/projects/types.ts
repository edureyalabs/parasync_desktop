// components/projects/types.ts
// Shapes of the project tables (supabase/migrations/20261009000000_agent_projects.sql). Read-only on the client:
// the projects engine in bemain writes everything, and cancelling goes through /api/projects/[id]/cancel.

export type ProjectStatus = 'scheduled' | 'active' | 'completed' | 'failed' | 'cancelled' | 'expired';
export type StepStatus = 'todo' | 'doing' | 'done' | 'skipped';

export interface ProjectStep { id: string; title: string; status: StepStatus; note?: string }

export interface Project {
  id: string;
  org_id: string;
  agent_id: string;
  created_by: string;
  chat_id: string | null;
  kind: 'project' | 'followup';
  title: string;
  goal: string;
  status: ProjectStatus;
  starts_at: string;
  ends_at: string;
  plan: ProjectStep[];
  outcome: string | null;
  report: string | null;
  last_error: string | null;
  hold_reason: string | null;
  wake_count: number;
  task_count: number;
  message_count: number;
  next_wake_at: string | null;
  created_at: string;
  ended_at: string | null;
  // The engine's bookkeeping, read to say what the project is doing right now (the list reads every column).
  failed_wakes?: number;
  retry_at?: string | null;
  claimed_at?: string | null;
  heartbeat_at?: string | null;
  last_wake_at?: string | null;
}

/** One wake of the project agent (project_wakes), read through /api/projects/[id]/runs. */
export interface ProjectWake {
  id: string;
  wake_no: number;
  reason: { events?: string[]; final?: boolean } | null;
  status: 'running' | 'done' | 'failed';
  terminator: string | null;
  iterations_used: number | null;
  error: string | null;
  failed_calls: { tool: string; error: string }[] | null;
  started_at: string;
  ended_at: string | null;
}

/** An event waiting for the next wake. */
export interface PendingEvent { kind: string; created_at: string }

export interface JournalEntry { id: string; project_id: string; wake_no: number | null; kind: string; content: string; created_at: string }

/** A task a project started (satisfies the Runsheet's ChainTask, so its chain can be drawn). */
export interface ProjectTask {
  id: string;
  definition: string;
  status: 'pending' | 'planning' | 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';
  trigger_type: 'immediate' | 'cron';
  active_chain_id: string | null;
  next_run_at: string | null;
  updated_at: string;
  last_error: string | null;
  created_at: string;
}

export const LIVE: ProjectStatus[] = ['scheduled', 'active'];
