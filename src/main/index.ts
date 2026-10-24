// src/main/index.ts
import { app, BrowserWindow, ipcMain, Menu, session, shell, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';

import { APP_CONFIG } from '../shared/config';
import { IPC, type AppInfo } from '../shared/ipc';
import { encryptionAvailable, getItem, removeItem, setItem } from './secureStore';
import { checkNow, getStatus, installNow, startUpdater } from './updater';
import { apiRequest, downloadToDisk } from './webApi';

const APP_ID = 'in.parasync.desktop';
const DEV_URL = process.env['ELECTRON_RENDERER_URL'];

let mainWindow: BrowserWindow | null = null;
let rendererReady = false;
let pendingCallback: string | null = null;

// ── helpers ─────────────────────────────────────────────────────────────────

/** Only http(s) and mailto may leave the app. Anything else (file:, javascript:, custom schemes) is refused. */
function safeExternal(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:' ? url : null;
  } catch {
    return null;
  }
}

/** True when an IPC call comes from our own page, never from some other frame or a navigated-away page. */
function trusted(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  return url.startsWith('file://') && event.sender === mainWindow?.webContents;
}

function handle<T>(channel: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => T | Promise<T>): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('untrusted caller');
    return fn(event, ...args);
  });
}

/** The deep link the system browser returns to after sign-in. Anything but our exact callback is dropped. */
function isAuthCallback(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === `${APP_CONFIG.protocol}:` && url.hostname === 'auth' && url.pathname === '/callback';
  } catch {
    return false;
  }
}

function deliverCallback(raw: string): void {
  if (!isAuthCallback(raw)) return;
  if (mainWindow && rendererReady) {
    mainWindow.webContents.send(IPC.authCallback, raw);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingCallback = raw; // the page is not up yet: hand it over as soon as it asks
  }
}

// ── window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#29281F',
    title: 'Parasync',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });

  // Links inside the page open in the person's browser, never in a new app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safe = safeExternal(url);
    if (safe) void shell.openExternal(safe.toString());
    return { action: 'deny' };
  });

  // The app is one page. If anything tries to navigate away, send it to the browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const inApp = (DEV_URL && url.startsWith(DEV_URL)) || url.startsWith('file://');
    if (inApp) return;
    event.preventDefault();
    const safe = safeExternal(url);
    if (safe) void shell.openExternal(safe.toString());
  });

  if (DEV_URL) void mainWindow.loadURL(DEV_URL);
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

// ── one instance, and the parasync:// link ──────────────────────────────────

if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient(APP_CONFIG.protocol, process.execPath, [join(process.argv[1] ?? '')]);
} else {
  app.setAsDefaultProtocolClient(APP_CONFIG.protocol);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((a) => a.startsWith(`${APP_CONFIG.protocol}://`));
    if (link) deliverCallback(link);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverCallback(url);
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault());
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    Menu.setApplicationMenu(null);

    // The page may use nothing from the machine (camera, microphone, location, ...).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications' || permission === 'clipboard-sanitized-write');
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'notifications' || permission === 'clipboard-sanitized-write');

    handle(IPC.storageGet, (_e, key) => getItem(key));
    handle(IPC.storageSet, (_e, key, value) => setItem(key, value));
    handle(IPC.storageRemove, (_e, key) => removeItem(key));

    handle(IPC.openExternal, async (_e, raw) => {
      const url = safeExternal(raw);
      if (!url) throw new Error('blocked link');
      await shell.openExternal(url.toString());
    });

    handle(IPC.openOAuth, async (_e, raw) => {
      const url = safeExternal(raw);
      const allowed = (APP_CONFIG.oauthHosts as readonly string[]).includes(url?.hostname ?? '');
      if (!url || url.protocol !== 'https:' || !allowed) throw new Error('blocked sign-in address');
      await shell.openExternal(url.toString());
    });

    handle(IPC.authCallbackReady, () => {
      rendererReady = true;
      const waiting = pendingCallback;
      pendingCallback = null;
      return waiting;
    });

    handle<AppInfo>(IPC.appInfo, () => ({
      version: app.getVersion(),
      platform: process.platform,
      packaged: app.isPackaged,
      secureStorage: encryptionAvailable(),
    }));

    handle(IPC.apiRequest, (_e, request) => apiRequest(request));
    handle(IPC.apiDownload, (_e, request) => downloadToDisk(request, mainWindow));

    handle(IPC.updateGet, () => getStatus());
    handle(IPC.updateCheck, () => checkNow());
    handle(IPC.updateInstall, () => installNow());

    createWindow();
    startUpdater(() => mainWindow);

    // Launched by a parasync:// link on a cold start (Windows passes it as an argument).
    const link = process.argv.find((a) => a.startsWith(`${APP_CONFIG.protocol}://`));
    if (link) deliverCallback(link);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
