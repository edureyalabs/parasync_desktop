// components/agent-profile/useAgentSummary.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { subInfo, type SubInfo } from '@/app/(shell)/account/organizations/subscription';

// Everything the owner's Agent Profile shows beside the form: what the agent is equipped with, what work it has, who can
// reach it, what it cost recently and its plan. All reads are RLS-scoped to the owner/admin (counts only: head requests),
// except spend, which uses the same per-day aggregate as the Usage tab so it is not capped by PostgREST's row limit.

export interface AgentSummary {
  counts: { tools: number; platformTools: number; instructions: number; connectors: number; mcp: number; signedApis: number; secrets: number; openTasks: number; shifts: number };
  network: { active: number; paused: number; pending: number };
  usage: { cost: number; calls: number; tokens: number } | null;
  usageDays: number;
  subscription: SubInfo | null;
  createdAt: string | null;
}

const USAGE_DAYS = 30;
const ZERO: AgentSummary = {
  counts: { tools: 0, platformTools: 0, instructions: 0, connectors: 0, mcp: 0, signedApis: 0, secrets: 0, openTasks: 0, shifts: 0 },
  network: { active: 0, paused: 0, pending: 0 }, usage: null, usageDays: USAGE_DAYS, subscription: null, createdAt: null,
};

export function useAgentSummary(agentId: string, visibility: string | undefined) {
  const [summary, setSummary] = useState<AgentSummary>(ZERO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId || !visibility) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // The Runsheet shows each person only their own tasks and shifts (the owner's included), so the counts here are the viewer's own.
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id ?? '';
      // A failed count is shown as 0 rather than failing the whole panel.
      const head = (table: string) => supabase.from(table).select('*', { count: 'exact', head: true }).eq('agent_id', agentId);
      const n = async (q: PromiseLike<{ count: number | null }>): Promise<number> => (await q).count ?? 0;

      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (USAGE_DAYS - 1));
      const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
      const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();

      const [tools, platformTools, instructions, connectors, mcp, signedApis, secrets, openTasks, shifts, active, paused, pending, usageResp, subResp, agentResp] = await Promise.all([
        n(head('tools').eq('enabled', true)),
        n(head('agent_platform_tools').eq('enabled', true)),
        n(head('instructions').eq('enabled', true)),
        n(head('agent_connectors').eq('enabled', true)),
        n(head('agent_mcp_servers').eq('enabled', true)),
        n(head('agent_signed_apis').eq('enabled', true)),
        n(head('secrets')),
        n(head('tasks').eq('created_by', uid).not('status', 'in', '(completed,cancelled,failed)')),
        n(head('shifts').eq('created_by', uid).in('status', ['pending', 'planning', 'planned'])),
        n(head('agent_network').eq('status', 'active')),
        n(head('agent_network').eq('status', 'paused')),
        n(head('agent_invites').eq('status', 'pending')),
        supabase.rpc('account_usage_series', { p_scope: 'payer', p_from: from.toISOString(), p_to: to.toISOString(), p_tz: tz }).range(0, 999),
        supabase.from('agent_subscriptions').select('current_period_end').eq('agent_id', agentId).maybeSingle(),
        supabase.from('agents').select('created_at').eq('id', agentId).maybeSingle(),
      ]);

      const rows = ((usageResp.data as Record<string, unknown>[] | null) ?? []).filter(r => r.agent_id === agentId);
      const usage: AgentSummary['usage'] = usageResp.error ? null : rows.reduce<NonNullable<AgentSummary['usage']>>(
        (t, r) => ({ cost: t.cost + (Number(r.cost) || 0), calls: t.calls + (Number(r.calls) || 0), tokens: t.tokens + (Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0) }),
        { cost: 0, calls: 0, tokens: 0 },
      );
      const periodEnd = (subResp.data as { current_period_end: string | null } | null)?.current_period_end ?? null;

      if (cancelled) return;
      setSummary({
        counts: { tools, platformTools, instructions, connectors, mcp, signedApis, secrets, openTasks, shifts },
        network: { active, paused, pending },
        usage, usageDays: USAGE_DAYS,
        subscription: subInfo({ visibility, current_period_end: periodEnd }, Date.now()),
        createdAt: (agentResp.data as { created_at: string } | null)?.created_at ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, visibility]);

  return { summary, loading };
}
