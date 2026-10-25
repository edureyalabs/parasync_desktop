// src/renderer/src/shims/apiBridge.ts
// The web app's screens call its own server with relative addresses (`fetch('/api/...')`, authorised by a browser cookie). The
// desktop has no cookie and no such server at its own address, so those calls are sent through the main process
// (src/main/webApi.ts) to the real site with the person's login token. Anything else (Supabase, other sites) passes straight through.
import { keepLocalCopy } from '~/lib/localCopy';
import { supabase } from '~/lib/supabase';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const json = (status: number, body: unknown) =>
  [204, 205, 304].includes(status) ? new Response(null, { status }) : new Response(JSON.stringify(body ?? null), { status, headers: { 'content-type': 'application/json' } });

export function installApiBridge(): void {
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return original(input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!METHODS.has(method)) return json(405, { error: 'Not supported.' });

    let body: unknown;
    let files: { field: string; name: string; type: string; data: ArrayBuffer }[] | undefined;
    let fields: Record<string, string> | undefined;
    const rawBody = init?.body;
    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try { body = JSON.parse(rawBody); } catch { return json(400, { error: 'Not supported.' }); }
    } else if (rawBody instanceof FormData) {
      // An upload: the bytes travel to the main process, which sends them on as a normal multipart form.
      files = []; fields = {};
      for (const [field, value] of rawBody.entries()) {
        if (typeof value === 'string') fields[field] = value;
        else files.push({ field, name: value.name, type: value.type, data: await value.arrayBuffer() });
      }
    } else if (rawBody !== undefined && rawBody !== null) {
      return json(415, { error: 'Not supported.' });
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return json(401, { error: 'You are signed out.' });

    const res = await window.parasync.api({
      path: url.pathname, query: Object.fromEntries(url.searchParams), method: method as Method, body, files, fields, token,
    });
    // A secret the person just saved is also kept on this PC (unless they turned that off), after the cloud accepted it.
    await keepLocalCopy(url.pathname, method, body, res.status, res.data, init?.headers);
    return json(res.status || 503, res.data);
  };
}
