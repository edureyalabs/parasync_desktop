// src/renderer/src/hooks/useRunner.ts
import { useEffect, useState } from 'react';

import type { RunnerStatus } from '@shared/runner';

export function useRunner(): { status: RunnerStatus; setEnabled: (on: boolean) => void; install: () => void } {
  const [status, setStatus] = useState<RunnerStatus>({ state: 'off', enabled: false });

  useEffect(() => {
    let cancelled = false;
    void window.parasync.runner.get().then((s) => { if (!cancelled) setStatus(s); }).catch(() => undefined);
    const off = window.parasync.runner.onStatus((s) => setStatus(s));
    return () => { cancelled = true; off(); };
  }, []);

  return {
    status,
    setEnabled: (on) => { void window.parasync.runner.setEnabled(on); },
    install: () => { void window.parasync.runner.install(); },
  };
}
