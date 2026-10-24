// src/renderer/src/global.d.ts
/// <reference types="vite/client" />
import type { DesktopApi } from '@shared/ipc';

declare global {
  // The web's screens mention process.env (replaced with an empty object at build time, see electron.vite.config.ts).
  const process: { env: Record<string, string | undefined> };

  interface Window {
    /** Injected by the preload script; the page's only way to reach the machine. */
    parasync: DesktopApi;
  }
}

export {};
