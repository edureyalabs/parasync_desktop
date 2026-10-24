// components/projects/useProjectRuns.ts
'use client';

import { useEffect, useState } from 'react';
import type { PendingEvent, ProjectWake } from './types';

export interface ProjectRuns { wakes: ProjectWake[]; pending: PendingEvent[] }

// The wakes of one project and the events waiting for the next one. The wake and event tables are internal, so they are read through
// /api/projects/[id]/runs (which checks the project is the caller's). Polled while the project is live (a wake changes every few
// seconds to minutes) and re-read when the project row itself changes (`signal`); read once for a finished one.
export function useProjectRuns(projectId: string, enabled: boolean, live: boolean, signal: string): ProjectRuns | null {
  const [runs, setRuns] = useState<ProjectRuns | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pull = async () => {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/runs`, { cache: 'no-store' }).catch(() => null);
      const data = resp && resp.ok ? await resp.json().catch(() => null) : null;
      if (!cancelled && data?.ok) setRuns({ wakes: data.wakes ?? [], pending: data.pending ?? [] });
    };
    void pull();
    const poll = live ? setInterval(() => void pull(), 8000) : null;
    return () => { cancelled = true; if (poll) clearInterval(poll); };
  }, [projectId, enabled, live, signal]);

  return runs;
}
