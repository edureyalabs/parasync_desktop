// components/shifts/useShiftRun.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AgentStep, ShiftCron, ShiftNode, ShiftRow, ShiftRun, ShiftStep, ShiftTick } from './types';

export interface ShiftRunData {
  run: ShiftRun | null;
  rows: ShiftRow[];
  steps: ShiftStep[];
  agentSteps: AgentStep[];
  nodes: ShiftNode[];
  crons: ShiftCron[];
  ticks: ShiftTick[];
  loading: boolean;
}

const EMPTY: ShiftRunData = { run: null, rows: [], steps: [], agentSteps: [], nodes: [], crons: [], ticks: [], loading: true };
const POLL_MS = 20000;

async function fetchRun(id: string): Promise<Omit<ShiftRunData, 'loading'>> {
  const supabase = createClient();
  const [runResp, rowResp, cronResp] = await Promise.all([
    supabase.from('shift_runs').select('*').eq('id', id).maybeSingle(),
    supabase.from('shift_rows').select('*').eq('shift_run_id', id).order('row_no'),
    supabase.from('shift_crons').select('*').eq('shift_run_id', id).order('created_at'),
  ]);
  const rows = (rowResp.data as ShiftRow[] | null) ?? [];
  const crons = (cronResp.data as ShiftCron[] | null) ?? [];
  const rowIds = rows.map(r => r.id);
  const [stepResp, nodeResp, tickResp, agentResp] = await Promise.all([
    rowIds.length ? supabase.from('shift_row_steps').select('*').in('row_id', rowIds).order('step_number') : Promise.resolve({ data: [] }),
    rowIds.length ? supabase.from('shift_row_nodes').select('*').in('row_id', rowIds).order('step_number') : Promise.resolve({ data: [] }),
    crons.length ? supabase.from('shift_cron_ticks').select('*').in('cron_id', crons.map(c => c.id)).order('tick_no') : Promise.resolve({ data: [] }),
    rowIds.length ? supabase.from('shift_row_agent_steps').select('*').in('row_id', rowIds).order('step_number') : Promise.resolve({ data: [] }),
  ]);
  return {
    run: (runResp.data as ShiftRun | null) ?? null, rows, crons,
    steps: (stepResp.data as ShiftStep[] | null) ?? [],
    agentSteps: (agentResp.data as AgentStep[] | null) ?? [],
    nodes: (nodeResp.data as ShiftNode[] | null) ?? [],
    ticks: (tickResp.data as ShiftTick[] | null) ?? [],
  };
}

// Everything the run view draws, for one run, kept live: rows/runs/ticks arrive over Realtime and
// any change reloads the (small) data set; a slow poll covers a missed event while the run is open.
export function useShiftRun(runId: string | null): ShiftRunData {
  const [data, setData] = useState<ShiftRunData>(EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const pull = async () => {
      const next = await fetchRun(runId);
      if (!cancelled) setData({ ...next, loading: false });
    };
    void (async () => { await pull(); })();
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void pull(); }, 350);
    };
    const channel = supabase
      .channel(`shift-run:${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_runs', filter: `id=eq.${runId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_rows', filter: `shift_run_id=eq.${runId}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_cron_ticks' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_row_agent_steps' }, refresh)
      .subscribe();
    const poll = setInterval(() => { void pull(); }, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  return runId ? data : EMPTY;
}
