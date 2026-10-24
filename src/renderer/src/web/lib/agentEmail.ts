// lib/agentEmail.ts
// Shared by the Email tab and the Agent Profile: an agent's permanent address and the rules the owner's settings must meet (bemain checks the same
// rules again when an agent sends: email_sender.py). The domain is the one verified in Resend for agent mail; it is public, not a secret.

export const EMAIL_DOMAIN = 'mails.parasync.in';
export const MAX_ALLOWED_RECIPIENTS = 50;
export const MIN_DAILY_CAP = 1;
export const MAX_DAILY_CAP = 500;

export function agentEmailAddress(handle: string): string {
  return `${handle}@${EMAIL_DOMAIN}`;
}

const ADDRESS = /^[a-z0-9._%+-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const DOMAIN_ENTRY = /^@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

// An allowlist entry is one address (alex@example.com) or a whole domain (@example.com). Returns the lower-cased entry, or null if it is neither.
export function normalizeAllowEntry(value: string): string | null {
  const text = value.trim().toLowerCase();
  return ADDRESS.test(text) || DOMAIN_ENTRY.test(text) ? text : null;
}

export type ReplyToMode = 'user' | 'owner' | 'none';

export const REPLY_TO_LABELS: Record<ReplyToMode, string> = {
  user: 'The person the agent is working for (falls back to you)',
  owner: 'You, the owner',
  none: 'No reply address',
};

export const STATUS_LABELS: Record<string, string> = {
  sending: 'Sending', sent: 'Sent', delayed: 'Delayed', delivered: 'Delivered', bounced: 'Bounced', complained: 'Reported', failed: 'Failed',
};

export function sourceLabel(kind: string | null): string {
  switch (kind) {
    case 'chat': return 'Chat';
    case 'planner_run': return 'Task';
    case 'task_run': return 'Task run';
    case 'shift_wake': case 'shift_plan': case 'shift_arena': return 'Shift';
    default: return kind ? kind.replace(/_/g, ' ') : 'Chat';
  }
}
