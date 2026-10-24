// components/runsheet/types.ts
// Row shapes the Runsheet's chain views read. They mirror the task_* tables (see the
// supabase/migrations) -- only the columns the UI actually uses.

export type ChainNodeType = 'tool' | 'llm_direct' | 'llm_agentic';
export type StepStatus = 'running' | 'completed' | 'failed';
/** A run can also be 'stuck': a node failed and the recovery engine is repairing it. */
export type RunStatus = StepStatus | 'stuck';
export type TaskStatusLike = 'pending' | 'planning' | 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ChainNode {
  id: string;
  step_number: number;
  node_type: ChainNodeType;
  config: {
    output_key?: string;
    tool_name?: string;
    instruction?: string;
    arguments?: Record<string, unknown>;
    tools?: string[];
    [key: string]: unknown;
  };
}

export interface RunLite {
  id: string;
  status: RunStatus;
  trigger_source: string;
  started_at: string;
  ended_at: string | null;
}

export interface RunStep {
  id: string;
  node_id: string;
  step_number: number;
  status: StepStatus;
  input_excerpt: string | null;
  output_excerpt: string | null;
  error: string | null;
  started_at: string;
  ended_at: string | null;
}

export const RUN_STEP_COLUMNS = 'id, node_id, step_number, status, input_excerpt, output_excerpt, error, started_at, ended_at';
export const CHAIN_NODE_COLUMNS = 'id, step_number, node_type, config';

/** The task fields the chain views need; the page's own Task type satisfies this. */
export interface ChainTask {
  id: string;
  status: TaskStatusLike;
  trigger_type: 'immediate' | 'cron';
  active_chain_id: string | null;
  next_run_at: string | null;
  updated_at: string;
  last_error: string | null;
}

/** All attempts at one step of a run (a failed step that was repaired has several). */
export interface StepGroup {
  latest: RunStep;
  attempts: number;
  /** earlier attempts, oldest first */
  earlier: RunStep[];
}
