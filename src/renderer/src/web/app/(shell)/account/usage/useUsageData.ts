// app/(shell)/account/usage/useUsageData.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addMonths, dayOf, monthStart, parseRow, type SeriesRow } from './model';

// Loads the aggregated spend (account_usage_series) for the last 13 calendar months ONCE, and
// lets the page slice it client-side: changing the date range, grouping, agents or sources is
// instant and never refetches. Only the scope (billed to me / used by me) asks the server again.
//
// Aggregates are one row per (day, agent, source, model), a few hundred rows for a busy
// account, but PostgREST caps a response at 1000 rows, so the result is read page by page.

export type Scope = 'payer' | 'user';

const PAGE_SIZE = 1000;
const MAX_PAGES = 40;       // 40k aggregate rows: a hard stop against a runaway loop
const WINDOW_MONTHS = 12;   // plus the current month

export interface UsageData {
  rows: SeriesRow[];
  /** First day of the window the rows cover (the previous-period comparison needs it). */
  windowStart: string;
  /** Today in the viewer's timezone, fixed for the life of the page. */
  today: string;
  /** True until the first load finishes. */
  loading: boolean;
  /** A later load (scope switch) in flight: keep showing the previous data, dimmed. */
  refetching: boolean;
  error: string | null;
  reload: () => void;
}

function viewerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function useUsageData(scope: Scope): UsageData {
  const [clock] = useState(() => {
    const now = new Date();
    const today = dayOf(now);
    return { today, windowStart: addMonths(monthStart(today), -WINDOW_MONTHS) };
  });
  const [rows, setRows] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedOnce = useRef(false);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loadedOnce.current) setRefetching(true);
      setError(null);

      const supabase = createClient();
      // Local midnight at both ends, so "today" is the viewer's today.
      const from = new Date(`${clock.windowStart}T00:00:00`).toISOString();
      const tomorrow = new Date(`${clock.today}T00:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const to = tomorrow.toISOString();

      const fetchAll = async (tz: string): Promise<{ data: SeriesRow[]; error: string | null }> => {
        const out: SeriesRow[] = [];
        for (let page = 0; page < MAX_PAGES; page++) {
          const { data, error: rpcError } = await supabase
            .rpc('account_usage_series', { p_scope: scope, p_from: from, p_to: to, p_tz: tz })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
          if (rpcError) return { data: [], error: rpcError.message };
          const batch = (data as Record<string, unknown>[] | null) ?? [];
          for (const raw of batch) out.push(parseRow(raw));
          if (batch.length < PAGE_SIZE) break;
        }
        return { data: out, error: null };
      };

      let result = await fetchAll(viewerTimezone());
      // A timezone name Postgres does not know would fail every call; fall back to UTC once.
      if (result.error && /time zone/i.test(result.error)) result = await fetchAll('UTC');
      if (cancelled) return;

      if (result.error) {
        setError('Could not load your usage. Please try again.');
      } else {
        setRows(result.data);
      }
      loadedOnce.current = true;
      setLoading(false);
      setRefetching(false);
    })();
    return () => { cancelled = true; };
  }, [scope, clock, nonce]);

  return { rows, windowStart: clock.windowStart, today: clock.today, loading, refetching, error, reload };
}
