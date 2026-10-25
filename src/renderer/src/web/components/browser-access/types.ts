// components/browser-access/types.ts
// Row shapes and constants for the Browser Access tab (tables browser_accesses, browser_access_runs / _steps / _profile_versions).

export interface AccessField {
  key: string;
  label: string;
  kind: 'text' | 'password' | 'select' | 'checkbox' | 'totp';
  secret?: boolean;
  options?: string[];
  required?: boolean;
}

export type AccessStatus = 'draft' | 'onboarding' | 'awaiting_credentials' | 'ready' | 'failed' | 'disabled';

export interface Access {
  id: string;
  name: string;
  label: string | null;
  login_url: string;
  host: string;
  allowed_hosts: string[];
  status: AccessStatus;
  enabled: boolean;
  available_to_members: boolean;
  fields: AccessField[];
  profile: string | null;
  profile_updated_at: string | null;
  coverage_pct: number;
  owner_context: string | null;
  profile_version: number;
  learn_enabled: boolean;
  last_learned_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
}

export interface Run {
  id: string;
  kind: 'onboard' | 'test' | 'study' | 'condense' | 'research' | 'build';
  status: 'queued' | 'running' | 'awaiting_credentials' | 'done' | 'failed';
  error: string | null;
  started_at: string;
  trigger: 'manual' | 'auto';
  attempts: number;
  next_attempt_at: string | null;
}

export interface Step {
  id: string;
  step_number: number;
  title: string;
  status: string;
  input_excerpt: string | null;
  output_excerpt: string | null;
  error: string | null;
}

export const ACCESS_COLUMNS = 'id, name, label, login_url, host, allowed_hosts, status, enabled, available_to_members, fields, profile, profile_updated_at, owner_context, coverage_pct, profile_version, learn_enabled, last_learned_at, last_verified_at, last_error';

export const STATUS_TEXT: Record<AccessStatus, string> = {
  draft: 'Not set up', onboarding: 'Setting up', awaiting_credentials: 'Needs your details', ready: 'Ready', failed: 'Needs attention', disabled: 'Off',
};

export const STATUS_TONE: Record<AccessStatus, 'neutral' | 'brass' | 'green' | 'red'> = {
  draft: 'neutral', onboarding: 'brass', awaiting_credentials: 'brass', ready: 'green', failed: 'red', disabled: 'neutral',
};

// A tool the researcher suggested (table tool_proposals) and a tool already linked to the access (agent_created_tools with access_id set).
export type ProposalStatus = 'proposed' | 'approved' | 'building' | 'built' | 'failed' | 'rejected';

export interface ProposalInput {
  name: string;
  data_type?: string;
  required?: boolean;
  context?: string;
}

export interface ToolProposal {
  id: string;
  name: string;
  title: string;
  summary: string;
  runs_in: 'http' | 'page';
  inputs: ProposalInput[];
  returns: string | null;
  changes_data: boolean;
  evidence: { number: number; task_id: string; definition: string }[];
  approach: string | null;
  sample_inputs: Record<string, unknown> | null;
  hint: string | null;
  status: ProposalStatus;
  remarks: string | null;
  tool_name: string | null;
  verification: string | null;
  error: string | null;
  created_at: string;
}

export interface LinkedToolRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  runs_in: 'http' | 'page' | null;
  verified_at: string | null;
  fail_count: number;
  last_error: string | null;
  usage_count: number;
}
