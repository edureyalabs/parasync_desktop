// components/shifts/usePlannerSteps.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PlannerStep } from './types';

async function fetchSteps(shiftId: string): Promise<PlannerStep[]> {
  const { data } = await createClient()
    .from('shift_planner_steps').select('*').eq('shift_id', shiftId).order('attempt').order('step_number');
  return (data as PlannerStep[] | null) ?? [];
}

export interface PlannerData {
  /** the steps of the chosen attempt (the latest by default) */
  steps: PlannerStep[];
  /** every planning attempt that left steps, oldest first */
  attempts: number[];
  /** the attempt `steps` belongs to */
  attempt: number;
}

// The planner's steps for one shift, live while it plans. `chosen` picks a past attempt; null (or an
// attempt that no longer exists) means the latest.
export function usePlannerSteps(shiftId: string, enabled: boolean, chosen: number | null = null): PlannerData {
  const [all, setAll] = useState<PlannerStep[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pull = async () => {
      const next = await fetchSteps(shiftId);
      if (!cancelled) setAll(next);
    };
    void (async () => { await pull(); })();
    const supabase = createClient();
    const channel = supabase
      .channel(`shift-planner:${shiftId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_planner_steps', filter: `shift_id=eq.${shiftId}` }, () => { void pull(); })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [shiftId, enabled]);

  const attempts = [...new Set(all.map(s => s.attempt))].sort((a, b) => a - b);
  const latest = attempts[attempts.length - 1] ?? 0;
  const attempt = chosen != null && attempts.includes(chosen) ? chosen : latest;
  return { steps: enabled ? all.filter(s => s.attempt === attempt) : [], attempts, attempt };
}
