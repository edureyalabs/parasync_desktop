// components/browser-jobs/types.ts
// Shapes of the Browser Access job tables the Runsheet lists (browser_access_runs / browser_access_steps). Read-only on the client: bemain writes
// everything; a run is stopped through /api/agents/[id]/browser-access/[accessId]/cancel.

export type JobKind = 'onboard' | 'test' | 'learn' | 'research' | 'build' | 'study' | 'condense';
export type JobStatus = 'queued' | 'running' | 'awaiting_credentials' | 'done' | 'failed';

export interface BrowserJob {
  id: string;
  access_id: string;
  kind: JobKind;
  status: JobStatus;
  error: string | null;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at: string | null;
  trigger: 'manual' | 'auto';
  attempts: number;
  next_attempt_at: string | null;
  scope: Record<string, unknown> | null;
}

export interface BrowserJobStep {
  id: string;
  run_id: string;
  step_number: number;
  kind: string;
  title: string;
  status: string;
  input_excerpt: string | null;
  output_excerpt: string | null;
  error: string | null;
  created_at: string;
}

export interface AccessRef { id: string; name: string; label: string | null; host: string | null }

export const JOB_COLUMNS = 'id, access_id, kind, status, error, started_at, ended_at, last_heartbeat_at, trigger, attempts, next_attempt_at, scope';
export const STEP_COLUMNS = 'id, run_id, step_number, kind, title, status, input_excerpt, output_excerpt, error, created_at';
export const LIVE_STATUSES: JobStatus[] = ['queued', 'running', 'awaiting_credentials'];
