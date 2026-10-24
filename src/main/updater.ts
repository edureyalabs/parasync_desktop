// src/main/updater.ts
// Automatic updates from this repo's GitHub Releases. An update downloads quietly in the background and installs
// when the app next closes (or when the person clicks "Restart to update"). Only a packaged build updates itself.
import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

import { IPC, type UpdateStatus } from '../shared/ipc';

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 15_000;

let status: UpdateStatus = { state: 'idle' };
let getWindow: () => BrowserWindow | null = () => null;
let started = false;

function publish(next: UpdateStatus): void {
  status = next;
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(IPC.updateStatus, next);
}

export const getStatus = (): UpdateStatus => status;

export async function checkNow(): Promise<void> {
  if (!app.isPackaged) {
    publish({ state: 'unsupported', reason: 'Updates are only checked in the installed app.' });
    return;
  }
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return;
  try {
    publish({ state: 'checking' });
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) publish({ state: 'idle' });
  } catch (e) {
    publish({ state: 'error', message: e instanceof Error ? e.message : 'Could not check for updates.' });
  }
}

export function installNow(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall(false, true);
}

export function startUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;
  if (started) return;
  started = true;
  if (!app.isPackaged) {
    status = { state: 'unsupported', reason: 'Updates are only checked in the installed app.' };
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', (info) => publish({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => publish({ state: 'idle' }));
  autoUpdater.on('download-progress', (p) => {
    const version = status.state === 'available' || status.state === 'downloading' ? status.version : '';
    publish({ state: 'downloading', version, percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (e) => publish({ state: 'error', message: e?.message ?? 'Update failed.' }));

  setTimeout(() => void checkNow(), FIRST_CHECK_DELAY_MS);
  setInterval(() => void checkNow(), CHECK_EVERY_MS).unref();
}
