// src/preload/index.ts
// The only bridge between the page and the machine. It exposes a short, fixed list of functions; the page never
// gets Node, the file system or Electron itself.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IPC, type DesktopApi, type UpdateStatus } from '../shared/ipc';

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DesktopApi = {
  info: () => ipcRenderer.invoke(IPC.appInfo),
  storage: {
    get: (key) => ipcRenderer.invoke(IPC.storageGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC.storageSet, key, value),
    remove: (key) => ipcRenderer.invoke(IPC.storageRemove, key),
  },
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  openOAuth: (url) => ipcRenderer.invoke(IPC.openOAuth, url),
  onAuthCallback: (cb) => {
    const off = subscribe<string>(IPC.authCallback, cb);
    // Tell the main process we are listening; a sign-in link that arrived during start-up is handed over now.
    void ipcRenderer.invoke(IPC.authCallbackReady).then((waiting: string | null) => {
      if (waiting) cb(waiting);
    });
    return off;
  },
  updates: {
    get: () => ipcRenderer.invoke(IPC.updateGet),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    onStatus: (cb) => subscribe<UpdateStatus>(IPC.updateStatus, cb),
  },
};

contextBridge.exposeInMainWorld('parasync', api);
