// components/agent-header/useWorkCounts.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Count { running: number; scheduled: number }
export interface WorkCounts { tasks: Count; shifts: Count; projects: Count }

const NONE: Count = { running: 0, scheduled: 0 };
export const EMPTY_COUNTS: WorkCounts = { tasks: NONE, shifts: NONE, projects: NONE };

// What counts, per kind, for the signed-in person's own work with this agent (the same "own work only" rule as the Runsheet):
//   tasks    running = being planned or running; scheduled = waiting to run or repeating (cron). A project's tasks belong to the
//            project, so they are not counted here. Finished, failed and cancelled ones are not active.
//   shifts   running = a shift with a run in progress; scheduled = a planned shift waiting for its next window. Retired ones are out.
//   projects running = active; scheduled = starting later. Follow-ups are the assistant's own bookkeeping and are left out.
async function fetchCounts(agentId: string): Promise<WorkCounts> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) return EMPTY_COUNTS;

  const [tasksRes, shiftsRes, projectsRes] = await Promise.all([
    supabase.from('tasks').select('status')
      .eq('agent_id', agentId).eq('created_by', uid).is('project_id', null)
      .in('status', ['pending', 'planning', 'planned', 'running']),
    supabase.from('shifts').select('id')
      .eq('agent_id', agentId).eq('created_by', uid).is('retired_at', null).eq('status', 'planned'),
    supabase.from('agent_projects').select('status')
      .eq('agent_id', agentId).eq('created_by', uid).eq('kind', 'project').in('status', ['scheduled', 'active']),
  ]);

  const tasks: Count = { running: 0, scheduled: 0 };
  for (const t of (tasksRes.data as { status: string }[] | null) ?? []) {
    if (t.status === 'running' || t.status === 'planning') tasks.running++; else tasks.scheduled++;
  }

  const shiftIds = ((shiftsRes.data as { id: string }[] | null) ?? []).map(s => s.id);
  let activeShifts = 0;
  if (shiftIds.length > 0) {
    const { data: runs } = await supabase.from('shift_runs').select('shift_id').in('shift_id', shiftIds).eq('status', 'active');
    activeShifts = new Set(((runs as { shift_id: string }[] | null) ?? []).map(r => r.shift_id)).size;
  }
  const shifts: Count = { running: activeShifts, scheduled: shiftIds.length - activeShifts };

  const projects: Count = { running: 0, scheduled: 0 };
  for (const p of (projectsRes.data as { status: string }[] | null) ?? []) {
    if (p.status === 'active') projects.running++; else projects.scheduled++;
  }
  return { tasks, shifts, projects };
}

/** Live counts of this person's active tasks, shifts and projects for one agent. Reloads (debounced) on any change. */
export function useWorkCounts(agentId: string): WorkCounts {
  const [counts, setCounts] = useState<WorkCounts>(EMPTY_COUNTS);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pull = async () => {
      try {
        const next = await fetchCounts(agentId);
        if (!cancelled) setCounts(next);
      } catch {
        // a failed refresh keeps the last known counts
      }
    };
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void pull(), 500);
    };
    void pull();

    const supabase = createClient();
    const channel = supabase
      .channel(`work-counts:${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `agent_id=eq.${agentId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `agent_id=eq.${agentId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_runs' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_projects', filter: `agent_id=eq.${agentId}` }, soon)
      .subscribe();

    // Realtime can miss events while the tab sleeps, and a shift or project can become active by the clock alone.
    const onVisible = () => { if (document.visibilityState === 'visible') soon(); };
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void pull(); }, 60_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [agentId]);

  return counts;
}
