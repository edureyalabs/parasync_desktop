// src/renderer/src/global.d.ts
/// <reference types="vite/client" />
import type { DesktopApi } from '@shared/ipc';

declare global {
  interface Window {
    /** Injected by the preload script; the page's only way to reach the machine. */
    parasync: DesktopApi;
  }
}

export {};
