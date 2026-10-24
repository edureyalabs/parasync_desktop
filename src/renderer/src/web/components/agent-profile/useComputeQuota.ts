// components/agent-profile/useComputeQuota.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// The agent's code-execution allowance for the current plan month, read through compute_quota_status(), which answers only the agent's owner and its connected
// people. A connected person on a shared (private) plan also gets their own share of it.

export interface ComputeQuota {
  has_plan: boolean;
  mode: 'off' | 'shadow' | 'enforce';
  cycle_start: string | null;
  cycle_end: string | null;
  included: number;
  used: number;
  overflow: number;
  remaining: number;
  price_per_run: number;
  is_owner: boolean;
  shared_pool: boolean;
  user_cap_fraction: number;
  your_used: number;
  your_cap: number | null;
  limits: {
    max_live_recurring_tasks: number;
    min_recurring_interval_minutes: number;
    max_projects_per_cycle: number;
    max_active_shifts: number;
  };
}

export function useComputeQuota(agentId: string | undefined) {
  const [quota, setQuota] = useState<ComputeQuota | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await createClient().rpc('compute_quota_status', { p_agent_id: agentId });
      if (cancelled) return;
      setQuota(error ? null : (data as ComputeQuota | null));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  return { quota, loading };
}
