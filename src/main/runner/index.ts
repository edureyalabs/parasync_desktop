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
import { setSessionToken, setSessionUser } from '../session';
import { startVault } from '../vault';
import { BrowserHosts } from './browserHost';
import { createCloud } from './cloud';
import { Executor, type BrowserApi } from './executor';
import { downloadRootfs, fetchManifest, type Manifest } from './install';
import { distroInstalled, importDistro, runJob, spawnBrowserHost, unregisterDistro, wslAvailable } from './wsl';

let executor: Executor | null = null;
let token: string | null = null;
let userIdNow: string | null = null;
let installAbort: AbortController | null = null;

const downloadDir = () => join(app.getPath('userData'), 'runner-download');
const installDir = () => join(app.getPath('userData'), 'runner-distro');

/**
 * Downloads one published Linux image (checked against its checksum) and imports it as the app's own WSL distribution. With `replace`, the
 * old distribution is removed only AFTER the new archive has been downloaded and verified, so a failed download never costs the old box.
 */
async function installFromManifest(manifest: Manifest, onPercent: (percent: number) => void, signal: AbortSignal, replace: boolean): Promise<void> {
  try {
    const archive = await downloadRootfs(downloadDir(), manifest, onPercent, signal);
    onPercent(99);
    if (replace) {
      await unregisterDistro(app.isPackaged);
      await fs.rm(installDir(), { recursive: true, force: true });
    }
    await fs.mkdir(installDir(), { recursive: true });
    await importDistro(app.isPackaged, installDir(), archive);
  } finally {
    await fs.rm(downloadDir(), { recursive: true, force: true }).catch(() => undefined);
  }
}

export function startRunner(getWindow: () => BrowserWindow | null): void {
  const packaged = app.isPackaged;
  const windows = process.platform === 'win32' || (!packaged && !!process.env['PARASYNC_WSL_BIN']);

  const hosts = new BrowserHosts((sessionId) => spawnBrowserHost(packaged, sessionId));
  const browser: BrowserApi = {
    size: () => hosts.size(),
    open: (id) => hosts.open(id),
    exec: (id, request) => hosts.exec(id, request),
    senses: (id, op, body) => hosts.senses(id, op, body),
    close: (id) => hosts.close(id),
    closeAll: () => hosts.closeAll(),
    // The self-test: a real browser starts, loads a page and gives it back (and, on an image that has them, describes it), then goes away.
    check: async (withSenses) => {
      const id = randomUUID();
      try {
        const opened = await hosts.open(id);
        if (!opened.ok) return { ok: false, note: opened.error ?? 'The browser did not start.' };
        const outcome = await hosts.exec(id, { code: "page.goto('data:text/html,<title>ok</title>')\nresult = page.title()", files: {}, env_vars: {}, timeout: 60 });
        if (outcome['ok'] !== true || outcome['result'] !== 'ok') return { ok: false, note: String(outcome['error'] ?? 'The test page did not load.') };
        if (!withSenses) return { ok: true };
        // Look and act are what the cloud will send here next, so a PC that cannot do them is not browser-ready (fail closed, like the sealed-box test).
        const look = await hosts.senses(id, 'look', { settle: false });
        return look['ok'] === true && String(look['report'] ?? '').includes('PAGE')
          ? { ok: true }
          : { ok: false, note: `The page description test failed: ${String(look['error'] ?? 'no report').slice(0, 200)}` };
      } finally {
        await hosts.close(id);
      }
    },
  };

  // The secrets this PC holds. When one is added or removed the cloud is told within a moment, so it knows what this PC can run.
  const vault = startVault(() => executor?.notifyHeldChanged());

  executor = new Executor({
    vault: {
      held: (userId) => vault.held(userId),
      resolve: (userId, wanted) => vault.resolve(userId, wanted),
    },
    cloud: createCloud(APP_CONFIG.supabaseUrl, APP_CONFIG.supabasePublishableKey, () => token),
    wslAvailable: async () => windows && wslAvailable(packaged),
    distroInstalled: async () => windows && distroInstalled(packaged),
    runJob: (job, seconds, broker) => runJob(packaged, job, seconds, broker),
    browser,
    update: {
      latest: async () => (await fetchManifest(AbortSignal.timeout(20_000))).version,
      apply: async (onPercent) => {
        const abort = new AbortController();
        const manifest = await fetchManifest(abort.signal);
        await installFromManifest(manifest, onPercent, abort.signal, true);
        return manifest.version;
      },
    },
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
  // Quitting: end the browsers and say goodbye to the cloud first (at most 3 s), then actually quit.
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
    setSessionToken(token);
    return;
  }
  userIdNow = validUser;
  setSessionUser(validUser);
  // Switching or signing out: the executor still needs the OLD token for its goodbye call, so replace it only afterwards.
  if (!validUser) await executor.setSession(null);
  token = validUser ? validToken : null;
  setSessionToken(token);
  if (validUser) await executor.setSession(validUser);
}

export async function runnerSetEnabled(enabled: unknown): Promise<void> {
  if (typeof enabled !== 'boolean') throw new Error('invalid value');
  await executor?.setEnabled(enabled);
}

/** The person pressed "Install the Linux box": the newest published image, a first-time import. */
export async function runnerInstall(): Promise<void> {
  if (!executor || installAbort) return;
  const ex = executor;
  const abort = new AbortController();
  installAbort = abort;
  try {
    ex.setInstalling(0);
    const manifest = await fetchManifest(abort.signal);
    await installFromManifest(manifest, (p) => ex.setInstalling(p), abort.signal, false);
    ex.setInstalling(null);
    await ex.afterInstall(manifest.version);
  } catch (e) {
    ex.reportError(e instanceof Error ? e.message : 'The install failed.');
  } finally {
    installAbort = null;
  }
}
