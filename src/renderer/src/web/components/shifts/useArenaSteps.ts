// components/shifts/useArenaSteps.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ArenaStep } from './types';

// The steps of a shift's pre-run learning pass (shift_arena_steps), oldest first. The shift's creator and the org's admins can read them
// (RLS). Polled every few seconds while the pass is running, read once otherwise.
export function useArenaSteps(shiftId: string, enabled: boolean, live: boolean): ArenaStep[] {
  const [steps, setSteps] = useState<ArenaStep[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pull = async () => {
      const { data } = await createClient().from('shift_arena_steps')
        .select('id, shift_id, pass_no, step_number, kind, tool, ok, counted, arguments, result, created_at')
        .eq('shift_id', shiftId).order('pass_no').order('step_number').limit(400);
      if (!cancelled) setSteps((data as ArenaStep[] | null) ?? []);
    };
    void (async () => { await pull(); })();
    const poll = live ? setInterval(() => void pull(), 4000) : null;
    return () => { cancelled = true; if (poll) clearInterval(poll); };
  }, [shiftId, enabled, live]);

  return steps;
}
