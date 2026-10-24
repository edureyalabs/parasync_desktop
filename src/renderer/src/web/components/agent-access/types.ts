// components/agent-access/types.ts
export type Visibility = 'personal' | 'private' | 'public';

/** What one connected user did with the agent in the recent window (see /api/agents/[id]/network). */
export interface UserUsage { calls: number; cost: number; lastActive: string | null }

/** Scheduled work a person has with the agent: counts only (the Runsheet shows each person only their own tasks). */
export interface UserTasks { open: number; recurring: number }

export interface Connection {
  id: string;
  user_id: string;
  status: 'active' | 'paused';
  source: 'marketplace' | 'invite';
  connected_at: string;
  email: string;
  usage: UserUsage;
  tasks: UserTasks;
}

export interface Invite {
  id: string;
  invited_email: string;
  code: string;
  status: 'pending' | 'redeemed' | 'revoked' | 'rejected';
  created_at: string;
}

export interface NetworkSummary {
  /** The people loaded so far (the list is paged, 20 at a time). */
  connections: Connection[];
  /** Everyone connected, loaded or not, and how many of them are active / paused. */
  total: number;
  active: number;
  paused: number;
  /** Everyone connected, added up: the only usage a public agent shows. */
  totals: { calls: number; cost: number };
  windowDays: number;
  /** True when the window held more calls than the server was willing to add up. */
  truncated: boolean;
}
