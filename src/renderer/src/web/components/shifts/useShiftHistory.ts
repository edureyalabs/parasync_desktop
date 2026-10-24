// components/shifts/useShiftHistory.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ShiftRun } from './types';

export const SHIFT_HISTORY_PAGE = 20;

// Finished runs (ended or terminated) of the viewer's own shifts of an agent, newest first, for the Runsheet's History tab
// (`shiftIds` is that list: nobody's history includes shifts somebody else set up).
//
// A run is ordered by when its window opened (`window_start`): a missed day has no `started_at`.
// Same keyset paging as the task history; `refreshKey` re-reads the newest page when a shift changes.
export function useShiftHistory(agentId: string, enabled: boolean, shiftIds: string[], refreshKey: unknown) {
  const key = shiftIds.join(',');
  const [runs, setRuns] = useState<ShiftRun[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable form of `shiftIds`
  const base = useCallback(() => createClient().from('shift_runs').select('*').eq('agent_id', agentId).in('shift_id', shiftIds).in('status', ['ended', 'terminated']), [agentId, key]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      if (shiftIds.length === 0) {
        if (!cancelled) { setRuns([]); setHasMore(false); setLoading(false); }
        return;
      }
      const { data } = await base().order('window_start', { ascending: false }).limit(SHIFT_HISTORY_PAGE);
      if (cancelled) return;
      const page = (data as ShiftRun[] | null) ?? [];
      setRuns(prev => merge(prev, page));
      setHasMore(prev => (loading ? page.length === SHIFT_HISTORY_PAGE : prev));
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, base, key, refreshKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || runs.length === 0) return;
    setLoadingMore(true);
    try {
      const { data } = await base().lt('window_start', runs[runs.length - 1].window_start).order('window_start', { ascending: false }).limit(SHIFT_HISTORY_PAGE);
      const page = (data as ShiftRun[] | null) ?? [];
      setRuns(prev => merge(prev, page));
      setHasMore(page.length === SHIFT_HISTORY_PAGE);
    } finally {
      setLoadingMore(false);
    }
  }, [base, hasMore, loadingMore, runs]);

  return { runs: enabled ? runs : [], hasMore: enabled && hasMore, loading: enabled && loading, loadingMore, loadMore };
}

function merge(prev: ShiftRun[], incoming: ShiftRun[]): ShiftRun[] {
  const byId = new Map(prev.map(r => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return Array.from(byId.values()).sort((a, b) => b.window_start.localeCompare(a.window_start));
}
