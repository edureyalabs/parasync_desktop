// src/main/runner/index.ts
// Wires the executor to the real machine: wsl.exe, the Parasync cloud, this app's encrypted store and the page. Windows only; on any
// other system the status says so and nothing is started.
import { app, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { APP_CONFIG } from '../../shared/config';
import { IPC } from '../../shared/ipc';
import { getItem, setItem } from '../secureStore';
import { createCloud } from './cloud';
import { Executor } from './executor';
import { downloadRootfs, fetchManifest } from './install';
import { distroInstalled, importDistro, runJob, wslAvailable } from './wsl';

let executor: Executor | null = null;
let token: string | null = null;
let userIdNow: string | null = null;
let installAbort: AbortController | null = null;

export function startRunner(getWindow: () => BrowserWindow | null): void {
  const packaged = app.isPackaged;
  const windows = process.platform === 'win32' || (!packaged && !!process.env['PARASYNC_WSL_BIN']);
  executor = new Executor({
    cloud: createCloud(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey, () => token),
    wslAvailable: async () => windows && wslAvailable(packaged),
    distroInstalled: async () => windows && distroInstalled(packaged),
    runJob: (job, seconds) => runJob(packaged, job, seconds),
    getSetting: (key) => getItem(key),
    setSetting: (key, value) => setItem(key, value),
    newId: () => randomUUID(),
    deviceName: hostname().slice(0, 80) || 'Windows PC',
    appVersion: app.getVersion(),
    now: () => new Date(),
    publish: (status) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send(IPC.runnerStatus, status);
    },
    log: (message) => console.warn('[runner]', message),
  });
  // Quitting: say goodbye to the cloud first (at most 3 s), then actually quit.
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting || !executor) return;
    event.preventDefault();
    quitting = true;
    void Promise.race([executor.goodbye(), new Promise((resolve) => setTimeout(resolve, 3_000))]).finally(() => app.quit());
  });
}

export const runnerStatus = () => executor?.getStatus() ?? { state: 'off' as const, enabled: false };

export async function runnerSession(userId: unknown, accessToken: unknown): Promise<void> {
  if (!executor) return;
  const validToken = typeof accessToken === 'string' && /^[A-Za-z0-9._-]{20,4096}$/.test(accessToken) ? accessToken : null;
  const validUser = typeof userId === 'string' && /^[0-9a-f-]{36}$/i.test(userId) && validToken ? userId : null;
  if (validUser === userIdNow) {
    token = validUser ? validToken : null; // the token is renewed by the page; it is only ever kept in memory
    return;
  }
  userIdNow = validUser;
  // Switching or signing out: the executor still needs the OLD token for its goodbye call, so replace it only afterwards.
  if (!validUser) await executor.setSession(null);
  token = validUser ? validToken : null;
  if (validUser) await executor.setSession(validUser);
}

export async function runnerSetEnabled(enabled: unknown): Promise<void> {
  if (typeof enabled !== 'boolean') throw new Error('invalid value');
  await executor?.setEnabled(enabled);
}

/** Downloads the Linux environment (checked against its published checksum) and imports it as the app's own WSL distribution. */
export async function runnerInstall(): Promise<void> {
  if (!executor || installAbort) return;
  const ex = executor;
  const abort = new AbortController();
  installAbort = abort;
  const downloadDir = join(app.getPath('userData'), 'runner-download');
  const installDir = join(app.getPath('userData'), 'runner-distro');
  try {
    ex.setInstalling(0);
    const manifest = await fetchManifest(abort.signal);
    const archive = await downloadRootfs(downloadDir, manifest, (p) => ex.setInstalling(p), abort.signal);
    ex.setInstalling(99);
    await fs.mkdir(installDir, { recursive: true });
    await importDistro(app.isPackaged, installDir, archive);
    await fs.rm(downloadDir, { recursive: true, force: true });
    ex.setInstalling(null);
    await ex.afterInstall(manifest.version);
  } catch (e) {
    await fs.rm(downloadDir, { recursive: true, force: true }).catch(() => undefined);
    ex.reportError(e instanceof Error ? e.message : 'The install failed.');
  } finally {
    installAbort = null;
  }
}
