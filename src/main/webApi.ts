// src/main/webApi.ts
// Lets the app call the Parasync web API (the same /api routes the web app uses) as the signed-in person. The call is made
// here, in the main process, so the page never needs browser cookies or cross-origin permission, and the page's network
// policy can stay "Supabase only". Only our own site, only /api/ paths, only GET and POST, with a time limit and size limits.
import { app, dialog, shell, type BrowserWindow } from 'electron';
import { createWriteStream, promises as fs } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { APP_CONFIG } from '../shared/config';
import type { ApiRequest, ApiResponse, DownloadResult } from '../shared/ipc';

const TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const TOKEN_SHAPE = /^[A-Za-z0-9._-]{20,4096}$/;

// The most recent login token the page used for a web-API call. Needed only to follow a "continue in your browser" redirect that
// the web's own code starts with a plain page navigation (see openApiRedirect), which carries no token of its own.
let lastToken: string | null = null;

// Only an unpackaged (development) run may point at a different site, for testing against a local fake; the installed app always uses ours.
const origin = new URL(!app.isPackaged && process.env['PARASYNC_WEB_URL'] ? process.env['PARASYNC_WEB_URL'] : APP_CONFIG.webUrl).origin;

/** Builds the full address, or throws if it is not an /api/ path on our own site. */
function buildUrl(path: unknown, query: ApiRequest['query']): URL {
  if (typeof path !== 'string' || !path.startsWith('/api/') || path.length > 512 || path.includes('..') || path.includes('\\')) {
    throw new Error('blocked path');
  }
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) throw new Error('blocked path');
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  return url;
}

function checkToken(token: unknown): string {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) throw new Error('not signed in');
  lastToken = token;
  return token;
}

async function readCapped(res: Response, cap: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      throw new Error('response too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function apiRequest(raw: unknown): Promise<ApiResponse> {
  const req = (raw ?? {}) as Partial<ApiRequest>;
  const url = buildUrl(req.path, req.query);
  const token = checkToken(req.token);
  const method = req.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? req.method : 'GET';
  const hasBody = method !== 'GET' && method !== 'DELETE';
  const files = Array.isArray(req.files) ? req.files : [];
  let form: FormData | null = null;
  if (files.length > 0) {
    let total = 0;
    form = new FormData();
    for (const [k, v] of Object.entries(req.fields ?? {})) if (typeof v === 'string') form.append(k, v);
    for (const f of files) {
      if (typeof f.field !== 'string' || typeof f.name !== 'string' || !(f.data instanceof ArrayBuffer)) return { ok: false, status: 400, data: { error: 'Invalid file.' } };
      total += f.data.byteLength;
      if (total > MAX_UPLOAD_BYTES) return { ok: false, status: 413, data: { error: 'This file is too large to upload here.' } };
      form.append(f.field, new Blob([f.data], { type: typeof f.type === 'string' ? f.type : 'application/octet-stream' }), safeName(f.name));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        // A multipart body sets its own Content-Type (with its boundary), so it must not be set here.
        ...(hasBody && !form ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form ?? (hasBody ? JSON.stringify(req.body ?? {}) : undefined),
      redirect: 'error', // an API route never needs to redirect; refusing keeps the token on our own site
      signal: controller.signal,
    });
    const text = await readCapped(res, MAX_JSON_BYTES);
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: 'The server sent something unexpected.' }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, status: 0, data: { error: aborted ? 'The request took too long.' : 'Parasync could not be reached.' } };
  } finally {
    clearTimeout(timer);
  }
}

/** The temporary file link from the web route, accepted only if it is https on our own Supabase storage (or, in a development run, the fake site). */
function fileLink(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const link = new URL(raw);
    const supabaseHost = new URL(APP_CONFIG.supabaseUrl).hostname;
    const devOk = !app.isPackaged && link.origin === origin;
    return (link.protocol === 'https:' && link.hostname === supabaseHost) || devOk ? link : null;
  } catch {
    return null;
  }
}

/**
 * The web's own code starts some sign-ins (MCP servers, connectors) by navigating the page to one of its /api/ addresses, which
 * answers with a redirect to the provider. A desktop window cannot follow that with the person's login, so the app asks the
 * address itself (with the token), takes the provider address from the redirect and opens that in the person's browser.
 */
export async function openApiRedirect(pathAndQuery: string): Promise<void> {
  if (!lastToken) return;
  const url = buildUrl(pathAndQuery.split('?')[0], Object.fromEntries(new URLSearchParams(pathAndQuery.split('?')[1] ?? '')));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${lastToken}` }, redirect: 'manual', signal: controller.signal });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const target = new URL(location, origin);
      if (target.protocol === 'https:' || target.origin === origin) await shell.openExternal(target.toString());
    }
  } catch {
    /* the person simply stays where they are */
  } finally {
    clearTimeout(timer);
  }
}

/** A file name that is safe to offer in a save dialog: no folders, no characters Windows rejects. */
function safeName(name: unknown): string {
  const base = basename(typeof name === 'string' ? name : 'download').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return base.slice(0, 120) || 'download';
}

export async function downloadToDisk(raw: unknown, window: BrowserWindow | null): Promise<DownloadResult> {
  try {
    const req = (raw ?? {}) as { path?: unknown; query?: ApiRequest['query']; token?: unknown; suggestedName?: unknown };
    const url = buildUrl(req.path, req.query);
    const token = checkToken(req.token);

    const target = await (window
      ? dialog.showSaveDialog(window, { defaultPath: safeName(req.suggestedName) })
      : dialog.showSaveDialog({ defaultPath: safeName(req.suggestedName) }));
    if (target.canceled || !target.filePath) return { state: 'cancelled' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      // The web route does not send the file itself: it checks the person may have it and answers with a short-lived link to it.
      const ask = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
      if (!ask.ok) return { state: 'failed', message: ask.status === 404 ? 'This file is no longer available.' : 'The file could not be downloaded.' };
      const answer = JSON.parse(await readCapped(ask, MAX_JSON_BYTES)) as { ok?: boolean; url?: unknown };
      const fileUrl = fileLink(answer.url);
      if (!answer.ok || !fileUrl) return { state: 'failed', message: 'This file is no longer available.' };

      // The link already carries its own permission, so no login token is sent to it.
      const res = await fetch(fileUrl, { redirect: 'error', signal: controller.signal });
      if (!res.ok || !res.body) return { state: 'failed', message: res.status === 404 ? 'This file is no longer available.' : 'The file could not be downloaded.' };
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > MAX_DOWNLOAD_BYTES) return { state: 'failed', message: 'This file is too large to download here.' };

      let received = 0;
      const limited = Readable.fromWeb(res.body as never).on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) limited.destroy(new Error('too large'));
      });
      await pipeline(limited, createWriteStream(target.filePath));
      shell.showItemInFolder(target.filePath);
      return { state: 'saved', path: target.filePath };
    } catch (e) {
      await fs.rm(target.filePath, { force: true }).catch(() => undefined); // never leave a half-written file behind
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { state: 'failed', message: aborted ? 'The download took too long.' : 'The file could not be downloaded.' };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { state: 'failed', message: 'The file could not be downloaded.' };
  }
}

