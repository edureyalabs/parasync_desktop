// src/main/runner/cloud.ts
// The app's side of the mailbox in Supabase (tables desktop_devices / desktop_jobs). Plain REST calls as the signed-in person: row-level
// security means they can only ever see and change their own devices and jobs. No service key exists in this app.

export interface JobRow {
  id: string;
  agent_id: string | null;
  payload: unknown;
  timeout_seconds: number;
}

export interface DevicePatch {
  name?: string;
  app_version?: string;
  runner_version?: string | null;
  local_enabled?: boolean;
  ready?: boolean;
  last_seen?: string;
  last_canary_at?: string;
  last_canary_ok?: boolean;
  last_canary_note?: string | null;
  browser_ready?: boolean;
  last_browser_canary_ok?: boolean;
  last_browser_canary_note?: string | null;
}

export class SignedOutError extends Error {}

export interface Cloud {
  /** Updates the device row; creates it on first use. */
  saveDevice(id: string, userId: string, patch: DevicePatch): Promise<void>;
  queuedJobs(deviceId: string): Promise<JobRow[]>;
  /** The job when this app won the claim, null when someone else did or it was cancelled. */
  claim(jobId: string): Promise<JobRow | null>;
  touch(jobId: string): Promise<boolean>;
  finish(jobId: string, ok: boolean, result: unknown, error: string | null): Promise<boolean>;
}

export function createCloud(baseUrl: string, apiKey: string, getToken: () => string | null): Cloud {
  async function call(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
    const token = getToken();
    if (!token) throw new SignedOutError('not signed in');
    const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.prefer ? { prefer: init.prefer } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401) throw new SignedOutError('session expired');
    if (!res.ok) throw new Error(`Parasync cloud answered ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async saveDevice(id, userId, patch) {
      const updated = (await call(`desktop_devices?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=representation' })) as unknown[];
      if (Array.isArray(updated) && updated.length > 0) return;
      await call('desktop_devices', {
        method: 'POST',
        body: JSON.stringify({ id, user_id: userId, name: patch.name ?? 'Windows PC', ...patch }),
        prefer: 'return=minimal',
      });
    },
    async queuedJobs(deviceId) {
      const rows = await call(`desktop_jobs?device_id=eq.${encodeURIComponent(deviceId)}&status=eq.queued&select=id,agent_id,payload,timeout_seconds&order=created_at.asc&limit=5`);
      return Array.isArray(rows) ? (rows as JobRow[]) : [];
    },
    async claim(jobId) {
      const row = (await call('rpc/claim_desktop_job', { method: 'POST', body: JSON.stringify({ p_job_id: jobId }) })) as Partial<JobRow> | null;
      return row && typeof row.id === 'string' ? (row as JobRow) : null;
    },
    async touch(jobId) {
      return (await call('rpc/touch_desktop_job', { method: 'POST', body: JSON.stringify({ p_job_id: jobId }) })) === true;
    },
    async finish(jobId, ok, result, error) {
      return (await call('rpc/finish_desktop_job', { method: 'POST', body: JSON.stringify({ p_job_id: jobId, p_ok: ok, p_result: result, p_error: error }) })) === true;
    },
  };
}
