// components/shifts/useShifts.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Shift, ShiftRun } from './types';

const RUNS_PER_SHIFT_SHOWN = 14;

export interface ShiftWithRuns {
  shift: Shift;
  activeRun: ShiftRun | null;
  lastRun: ShiftRun | null;
}

async function fetchItems(agentId: string): Promise<ShiftWithRuns[]> {
  const supabase = createClient();
  // Only the viewer's own shifts, the agent's owner included: an owner's RLS would let them read everyone's, but this list
  // is each person's own work (see the Runsheet).
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) return [];
  const { data: shiftRows } = await supabase
    .from('shifts').select('*').eq('agent_id', agentId).eq('created_by', uid).order('created_at', { ascending: false });
  const shifts = (shiftRows as Shift[] | null) ?? [];
  let runs: ShiftRun[] = [];
  if (shifts.length > 0) {
    const { data: runRows } = await supabase
      .from('shift_runs').select('*')
      .in('shift_id', shifts.map(s => s.id))
      .order('run_date', { ascending: false })
      .limit(shifts.length * RUNS_PER_SHIFT_SHOWN);
    runs = (runRows as ShiftRun[] | null) ?? [];
  }
  return shifts.map(shift => {
    const own = runs.filter(r => r.shift_id === shift.id);
    return {
      shift,
      activeRun: own.find(r => r.status === 'active') ?? null,
      lastRun: own.find(r => r.status === 'ended' || r.status === 'terminated') ?? null,
    };
  });
}

// Shifts of one agent, each with its active run and its latest finished run. Live: the list
// reloads (debounced) whenever a shift or a run changes, so planning -> planned -> running ->
// ended shows up without a refresh.
export function useShifts(agentId: string) {
  const [items, setItems] = useState<ShiftWithRuns[]>([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    setItems(await fetchItems(agentId));
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const next = await fetchItems(agentId);
      if (!cancelled) { setItems(next); setLoading(false); }
    };
    void (async () => { await pull(); })();
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void pull(); }, 400);
    };
    const channel = supabase
      .channel(`shifts:${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `agent_id=eq.${agentId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_runs' }, refresh)
      .subscribe();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [agentId]);

  return { items, loading, reload };
}

// The runs of one shift, newest first (for the run picker).
export function useShiftRuns(shiftId: string | null) {
  const [runs, setRuns] = useState<ShiftRun[]>([]);

  useEffect(() => {
    if (!shiftId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient().from('shift_runs').select('*').eq('shift_id', shiftId).order('run_date', { ascending: false }).limit(30);
      if (!cancelled) setRuns((data as ShiftRun[] | null) ?? []);
    })();
    return () => { cancelled = true; };
  }, [shiftId]);

  return runs;
}
