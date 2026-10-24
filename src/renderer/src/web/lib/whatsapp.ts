// lib/whatsapp.ts
// Shared by the WhatsApp tab and its API routes: the tool key, status vocabulary and the rules the owner's settings must meet. The gateway (repo
// parasync_wa, see its wa.md) re-checks everything that matters; nothing here is a security boundary.

/** The WhatsApp card in Platform Tools is these three tools; the tab exists, and the number stays connected, while any of them is on. */
export const WA_TOOL_KEYS = ['whatsapp_chats', 'whatsapp_read', 'whatsapp_send'];
export const MIN_SEND_CAP = 1;
export const MAX_SEND_CAP = 500;
export const RETENTION_DAYS = 30;             // a platform constant, not a setting: the database clean-up (pg_cron wa_cleanup + the wa-cleanup edge function) deletes messages, sent records and files after 30 days
export const DEVICE_NAME = 'Parasync Agents';  // what the linked device is called under WhatsApp > Linked devices (set when the device is paired)
export const CONTEXT_MAX = 1000;              // matches wa_chats.context
/** The gateway renews the heartbeat every ~15 s; this long without one means it is not driving the number. */
export const HEARTBEAT_STALE_MS = 90_000;

export type WaStatus = 'idle' | 'connecting' | 'awaiting_scan' | 'connected' | 'reconnecting' | 'disconnected' | 'logged_out' | 'blocked' | 'replaced' | 'error';
export type WaAccess = 'none' | 'read' | 'send' | 'both';
export type Tone = 'green' | 'amber' | 'red' | 'brass' | 'slate' | 'neutral';

export interface WaConnection {
  status: WaStatus;
  desired_state: 'running' | 'stopped';
  link_mode: 'qr' | 'code';
  phone_number: string | null;
  push_name: string | null;
  qr_data_url: string | null;
  qr_updated_at: string | null;
  pairing_code: string | null;
  last_error: string | null;
  last_connected_at: string | null;
  last_heartbeat_at: string | null;
  acknowledged_at: string | null;
  stop_reason: WaStopReason | null;
  next_retry_at: string | null;
  reconnect_streak: number;
  last_disconnect_code: number | null;
}

/** Why a link is not running (NULL while it runs). `gave_up` = resting after repeated failures; the gateway starts it again by itself at next_retry_at. */
export type WaStopReason = 'owner' | 'tool_off' | 'logged_out' | 'blocked' | 'gave_up' | 'never_linked' | 'unlinked';

/** One line of the connection history (wa_connection_events). */
export interface WaEvent {
  id: string;
  at: string;
  event: string;
  status: string | null;
  code: number | null;
  detail: string | null;
}

export const EVENT_LABEL: Record<string, string> = {
  connected: 'Connected',
  closed: 'Connection lost',
  reconnecting: 'Reconnecting',
  replaced: 'Taken over by another connection',
  logged_out: 'Unlinked from the phone',
  blocked: 'Refused by WhatsApp',
  gave_up: 'Resting after repeated failures',
  error: 'Needs attention',
  link_incomplete: 'Linking did not finish',
  link_requested: 'Connect pressed',
  stopped: 'Disconnected by you',
  tool_off: 'WhatsApp switched off',
  tool_on_resume: 'Resumed after switch-on',
  resumed: 'Resumed',
  unlinked: 'Unlinked by you',
  lease_lost: 'Moved to another server',
};

export const EVENT_TONE: Record<string, Tone> = {
  connected: 'green', tool_on_resume: 'green', resumed: 'green',
  logged_out: 'red', blocked: 'red', error: 'red',
  replaced: 'amber', gave_up: 'amber', reconnecting: 'amber', closed: 'amber', link_incomplete: 'amber', lease_lost: 'neutral',
  link_requested: 'neutral', stopped: 'slate', tool_off: 'slate', unlinked: 'slate',
};

export interface Attention {
  tone: 'red' | 'amber';
  title: string;
  text: string;
  /** What the owner can do about it: press Connect (the link is still there), or link the number again with a new QR code. */
  action: 'connect' | 'relink' | null;
}

/**
 * The one thing the owner should know about a link that is not simply working. Null when everything is fine or the state is the owner's own doing (disconnected by
 * them, switched off, never linked). The gateway heals most problems by itself; this only speaks up for what it cannot fix (logged out, refused) and for what is
 * taking a while (resting, reconnecting for a long time).
 */
export function attentionOf(conn: Pick<WaConnection, 'status' | 'stop_reason' | 'next_retry_at' | 'reconnect_streak'> | null, now: number = Date.now()): Attention | null {
  if (!conn) return null;
  const retryAt = conn.next_retry_at ? new Date(conn.next_retry_at).getTime() : 0;
  switch (conn.status) {
    case 'logged_out':
      return { tone: 'red', title: 'Unlinked from the phone', action: 'relink', text: 'WhatsApp removed this device, or the number was logged out on the phone. Nothing is read or sent until you link the number again with a new QR code.' };
    case 'blocked':
      return { tone: 'red', title: 'Refused by WhatsApp', action: null, text: 'WhatsApp refused this account. It may be restricted or banned, so it is not retried automatically. Check the number on the phone before linking again.' };
    case 'replaced':
    case 'error':
      if (conn.stop_reason === 'gave_up' && retryAt > now) {
        const when = new Date(retryAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return { tone: 'amber', title: 'Resting after repeated failures', action: 'connect', text: `WhatsApp kept closing this connection, so it is paused to protect the number. It will try again by itself around ${when}. Press Connect to try now.` };
      }
      return { tone: 'red', title: conn.status === 'replaced' ? 'Taken over by another connection' : 'Needs attention', action: 'connect', text: conn.status === 'replaced' ? 'This number was connected from somewhere else, so this link closed. Press Connect to take it back.' : 'WhatsApp keeps rejecting this session. Press Connect; if it keeps failing, unlink and link the number again.' };
    case 'reconnecting':
      if (conn.reconnect_streak >= 3) return { tone: 'amber', title: 'Still reconnecting', action: null, text: `The link has dropped ${conn.reconnect_streak} times in a row and keeps retrying by itself. If the phone has been offline or without internet, bring it back online.` };
      return null;
    default:
      return null;
  }
}

export interface WaChat {
  id: string;
  jid: string;
  kind: 'group' | 'contact';
  name: string | null;
  participants_count: number | null;
  access: WaAccess;
  context: string | null;
  source: 'sync' | 'manual';
  active: boolean;
  last_message_at: string | null;
}

export interface WaSent {
  id: string;
  chat_jid: string;
  text: string;
  attachment_name: string | null;
  status: 'sending' | 'sent' | 'failed';
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export const STATUS_LABEL: Record<WaStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  awaiting_scan: 'Waiting for you to link',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  logged_out: 'Unlinked from the phone',
  blocked: 'Refused by WhatsApp',
  replaced: 'Taken over elsewhere',
  error: 'Needs attention',
};

export const STATUS_TONE: Record<WaStatus, Tone> = {
  idle: 'neutral', connecting: 'amber', awaiting_scan: 'brass', connected: 'green', reconnecting: 'amber',
  disconnected: 'slate', logged_out: 'red', blocked: 'red', replaced: 'red', error: 'red',
};

export const ACCESS_LABEL: Record<WaAccess, string> = { none: 'No access', read: 'Read', send: 'Send', both: 'Read and send' };

/** True while the gateway should be driving the number but has not reported in recently. */
export function gatewayQuiet(conn: Pick<WaConnection, 'desired_state' | 'last_heartbeat_at'> & Partial<Pick<WaConnection, 'status' | 'next_retry_at'>> | null, now: number = Date.now()): boolean {
  if (!conn || conn.desired_state !== 'running') return false;
  // A link resting after repeated failures (or waiting for a retry it scheduled) releases its lease on purpose, so a quiet heartbeat is expected.
  if (conn.next_retry_at && new Date(conn.next_retry_at).getTime() > now && (conn.status === 'replaced' || conn.status === 'error')) return false;
  if (conn.status === 'logged_out' || conn.status === 'blocked') return false;
  if (!conn.last_heartbeat_at) return true;
  return now - new Date(conn.last_heartbeat_at).getTime() > HEARTBEAT_STALE_MS;
}

/** Statuses during which the page polls quickly. */
export function isTransient(status: WaStatus | undefined): boolean {
  return status === 'connecting' || status === 'awaiting_scan' || status === 'reconnecting';
}

export function formatPhone(digits: string | null | undefined): string {
  return digits ? `+${digits}` : '';
}

/** What the agent can and cannot do with WhatsApp today; shown on the tab. */
export const BETA_NOTE = 'The agent reads text messages (it cannot see pictures or hear voice notes) and replies with text and attachments. Messages are read only while the number is connected, so some can be missed during an outage or while the link is down.';

// The hard limits the WhatsApp tools run under. Sending limits are enforced by the gateway (parasync_wa src/send.ts), reading limits by bemain (whatsapp_store.py);
// they are listed here only so the Agent Profile can show them. The daily send limit is the owner's own setting (MIN_SEND_CAP to MAX_SEND_CAP).
export const WA_LIMITS = {
  sendTextMaxChars: 4000,
  sendFileMaxMb: 16,
  duplicateWindowMinutes: 10,
  readDefaultMessages: 50,
  readMaxMessages: 200,
  readTextCharsPerMessage: 1500,
  readAttachmentsPerRead: 10,
} as const;
