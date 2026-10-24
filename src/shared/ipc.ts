// src/shared/ipc.ts
// The one contract between the locked-down page (renderer) and the main process. Every channel is listed here,
// and the preload exposes nothing else.

import type { RunnerStatus } from './runner';

export const IPC = {
  storageGet: 'storage:get',
  storageSet: 'storage:set',
  storageRemove: 'storage:remove',
  openExternal: 'shell:open-external',
  openOAuth: 'shell:open-oauth',
  authCallback: 'auth:callback',
  authCallbackReady: 'auth:callback-ready',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateGet: 'update:get',
  updateStatus: 'update:status',
  appInfo: 'app:info',
  apiRequest: 'api:request',
  apiDownload: 'api:download',
  runnerGet: 'runner:get',
  runnerSetEnabled: 'runner:set-enabled',
  runnerInstall: 'runner:install',
  runnerSession: 'runner:session',
  runnerStatus: 'runner:status',
} as const;

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'unsupported'; reason: string }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export interface AppInfo {
  version: string;
  platform: string;
  packaged: boolean;
  secureStorage: boolean;
}

/** A call to the Parasync web API (the same /api routes the web app uses). The signed-in person's access token goes in `token`. */
export interface ApiRequest {
  path: string; // must start with /api/
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number>;
  body?: unknown;
  /** Files sent as a multipart form (an upload). `data` is the file's bytes. */
  files?: { field: string; name: string; type: string; data: ArrayBuffer }[];
  /** Plain text fields sent alongside `files`. */
  fields?: Record<string, string>;
  token: string;
}

export type ApiResponse = { ok: boolean; status: number; data: unknown };

export type DownloadResult =
  | { state: 'saved'; path: string }
  | { state: 'cancelled' }
  | { state: 'failed'; message: string };

export interface DesktopApi {
  info(): Promise<AppInfo>;
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  /** http(s) and mailto only. */
  openExternal(url: string): Promise<void>;
  /** Calls a Parasync web API route from the main process (no browser cookies, no CORS). Never throws on HTTP errors; check `ok`. */
  api(request: ApiRequest): Promise<ApiResponse>;
  /** Downloads a file from a web API route and asks where to save it. */
  download(request: { path: string; query?: Record<string, string | number>; token: string; suggestedName: string }): Promise<DownloadResult>;
  /** Opens the sign-in page of an allowed provider in the system browser. */
  openOAuth(url: string): Promise<void>;
  /** Fires with the parasync://auth/callback URL when the browser hands the sign-in back. */
  onAuthCallback(cb: (url: string) => void): () => void;
  /** Running agents' tool code on this PC (Windows only). The work itself happens in the main process. */
  runner: {
    get(): Promise<RunnerStatus>;
    setEnabled(enabled: boolean): Promise<void>;
    install(): Promise<void>;
    /** Tells the main process who is signed in (null on sign-out) and the current access token, renewed whenever it changes. */
    setSession(userId: string | null, token: string | null): Promise<void>;
    onStatus(cb: (status: RunnerStatus) => void): () => void;
  };
  updates: {
    get(): Promise<UpdateStatus>;
    check(): Promise<void>;
    install(): Promise<void>;
    onStatus(cb: (status: UpdateStatus) => void): () => void;
  };
}
