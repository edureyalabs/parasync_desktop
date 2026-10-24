// src/shared/ipc.ts
// The one contract between the locked-down page (renderer) and the main process. Every channel is listed here,
// and the preload exposes nothing else.

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

export interface DesktopApi {
  info(): Promise<AppInfo>;
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  /** http(s) and mailto only. */
  openExternal(url: string): Promise<void>;
  /** Opens the sign-in page of an allowed provider in the system browser. */
  openOAuth(url: string): Promise<void>;
  /** Fires with the parasync://auth/callback URL when the browser hands the sign-in back. */
  onAuthCallback(cb: (url: string) => void): () => void;
  updates: {
    get(): Promise<UpdateStatus>;
    check(): Promise<void>;
    install(): Promise<void>;
    onStatus(cb: (status: UpdateStatus) => void): () => void;
  };
}
