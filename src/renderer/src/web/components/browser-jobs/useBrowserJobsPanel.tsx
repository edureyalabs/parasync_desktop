// components/browser-jobs/useBrowserJobsPanel.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ConfirmModal from '@/components/shifts/ConfirmModal';
import { INK, SOFT } from '@/components/projects/tokens';
import BrowserJobCard from './BrowserJobCard';
import { accessName, isLive, jobTitle } from './jobModel';
import { JOB_COLUMNS, STEP_COLUMNS, type AccessRef, type BrowserJob, type BrowserJobStep } from './types';

// An item of the Runsheet's Active list, ordered together with the tasks, shifts and projects around it: rank 0 = working now, 1 = waiting, 2 = later.
export interface BrowserJobActiveEntry { key: string; rank: number; at: number; node: React.ReactNode }

const RECENT_RUNS = 80;
const POLL_MS = 8000;

// Everything the Runsheet needs from the Browser Access jobs of an agent (owner only): the live ones for the Active list, the finished ones for History,
// and the cancel dialog. Learning runs, tool searches, tool builds, setups and login tests are all the same kind of job here, each with its step rail.
export function useBrowserJobsPanel(agentId: string, enabled: boolean) {
  const [accesses, setAccesses] = useState<AccessRef[]>([]);
  const [jobs, setJobs] = useState<BrowserJob[]>([]);
  const [steps, setSteps] = useState<Record<string, BrowserJobStep[]>>({});
  const [cancelling, setCancelling] = useState<BrowserJob | null>(null);
  const accessIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!enabled) return;
    const supabase = createClient();
    const { data: accessRows } = await supabase.from('browser_accesses').select('id, name, label, host').eq('agent_id', agentId);
    const refs = (accessRows as AccessRef[]) ?? [];
    setAccesses(refs);
    accessIds.current = new Set(refs.map(a => a.id));
    if (!refs.length) { setJobs([]); return; }
    const { data: runRows } = await supabase.from('browser_access_runs').select(JOB_COLUMNS).in('access_id', refs.map(a => a.id))
      .order('started_at', { ascending: false }).limit(RECENT_RUNS);
    const runs = (runRows as BrowserJob[]) ?? [];
    setJobs(runs);
    if (!runs.length) return;
    const { data: stepRows } = await supabase.from('browser_access_steps').select(STEP_COLUMNS).in('run_id', runs.map(r => r.id)).order('step_number', { ascending: true }).limit(4000);
    const grouped: Record<string, BrowserJobStep[]> = {};
    for (const row of (stepRows as BrowserJobStep[]) ?? []) (grouped[row.run_id] ||= []).push(row);
    setSteps(grouped);
  }, [agentId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(load, 0);
    const supabase = createClient();
    const channel = supabase.channel(`browser-jobs-${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_access_runs' }, payload => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Partial<BrowserJob>;
        if (row.access_id && !accessIds.current.has(row.access_id)) return;      // another agent's site
        load();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'browser_access_steps' }, payload => {
        const row = payload.new as BrowserJobStep;
        setSteps(prev => {
          const list = prev[row.run_id];
          if (!list) return prev;                                                 // not a run we show
          return list.some(s => s.id === row.id) ? prev : { ...prev, [row.run_id]: [...list, row].sort((a, b) => a.step_number - b.step_number) };
        });
      })
      .subscribe();
    return () => { clearTimeout(first); supabase.removeChannel(channel); };
  }, [agentId, enabled, load]);

  const anyLive = jobs.some(isLive);
  useEffect(() => {
    if (!enabled || !anyLive) return;
    const timer = setInterval(load, POLL_MS);                                      // a safety net: the live channel can miss an event
    return () => clearInterval(timer);
  }, [enabled, anyLive, load]);

  const accessOf = useMemo(() => new Map(accesses.map(a => [a.id, a])), [accesses]);

  const cancel = async (job: BrowserJob): Promise<string | null> => {
    const access = accessOf.get(job.access_id);
    const resp = await fetch(`/api/agents/${agentId}/browser-access/${job.access_id}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_id: job.id }),
    }).catch(() => null);
    const data = resp ? await resp.json().catch(() => null) : null;
    if (!resp || !data?.ok) return data?.error ?? `Could not cancel the job${access ? ` for ${accessName(access)}` : ''}. Please try again.`;
    await load();
    return null;
  };

  const activeEntries: BrowserJobActiveEntry[] = jobs.filter(isLive).map(job => ({
    key: `browser-job-${job.id}`,
    rank: job.status === 'running' ? 0 : 1,
    at: new Date(job.started_at).getTime(),
    node: <BrowserJobCard job={job} access={accessOf.get(job.access_id)} steps={steps[job.id] ?? []} onCancel={() => setCancelling(job)} />,
  }));

  const history = jobs.filter(j => !isLive(j));

  const dialogs = cancelling && (
    <ConfirmModal
      title="Cancel this job?"
      body={<><strong style={{ color: INK, fontWeight: 500 }}>{jobTitle(cancelling, accessOf.get(cancelling.access_id))}</strong> stops now<span style={{ color: SOFT }}>. Whatever it already saved stays saved.</span></>}
      confirmLabel="Cancel job" keepLabel="Keep going"
      onConfirm={() => cancel(cancelling)} onClose={() => setCancelling(null)}
    />
  );

  const stepsOf = (id: string) => steps[id] ?? [];
  return { activeEntries, history, dialogs, accessOf, stepsOf, requestCancel: setCancelling };
}
