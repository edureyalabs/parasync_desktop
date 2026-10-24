// src/renderer/src/lib/api.ts
// Calls to the Parasync web API (the same /api routes the web app uses), made as the signed-in person. The call itself is
// made by the main process (see src/main/webApi.ts); this file only adds the person's current access token.
import type { DownloadResult } from '@shared/ipc';

import { supabase } from '@/lib/supabase';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function messageOf(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') return (data as { error: string }).error;
  return fallback;
}

export async function apiGet<T>(path: string, query?: Record<string, string | number>): Promise<ApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, error: 'You are signed out. Sign in again.' };
  const res = await window.parasync.api({ path, query, token });
  if (res.ok) return { ok: true, data: res.data as T };
  const fallback = res.status === 401 ? 'Your session ended. Sign in again.' : res.status === 403 ? 'You do not have access to this.' : res.status === 404 ? 'This could not be found.' : 'This could not be loaded right now.';
  return { ok: false, status: res.status, error: messageOf(res.data, fallback) };
}

export async function downloadFile(path: string, query: Record<string, string | number>, suggestedName: string): Promise<DownloadResult> {
  const token = await accessToken();
  if (!token) return { state: 'failed', message: 'You are signed out. Sign in again.' };
  return window.parasync.download({ path, query, token, suggestedName });
}
