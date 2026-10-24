// src/renderer/src/hooks/useUpdates.ts
import { useEffect, useState } from 'react';

import type { AppInfo, UpdateStatus } from '@shared/ipc';

export function useUpdates(): { status: UpdateStatus; info: AppInfo | null; check: () => void; install: () => void } {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.parasync.info().then((i) => { if (!cancelled) setInfo(i); }).catch(() => undefined);
    void window.parasync.updates.get().then((s) => { if (!cancelled) setStatus(s); }).catch(() => undefined);
    const off = window.parasync.updates.onStatus((s) => setStatus(s));
    return () => { cancelled = true; off(); };
  }, []);

  return {
    status,
    info,
    check: () => { void window.parasync.updates.check(); },
    install: () => { void window.parasync.updates.install(); },
  };
}
