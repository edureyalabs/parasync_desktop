// components/runsheet/useChainData.ts
'use client';

// Data hooks behind the chain views.
//
//   useTaskChain    -- a live task's chain: its nodes (including the half-built draft while
//                      the planner is still assembling it) plus its latest run and that run's
//                      steps. With `live`, nodes and steps stream in over realtime, so nodes
//                      appear as the planner saves them and light up as the runner reaches them.
//   useRunSnapshot  -- one finished run, fetched once (History).
//   useInViewOnce   -- true from the first time an element scrolls into view, so a long
//                      History list only loads the cards the person actually looks at.
//
// State is stored with the key it was loaded for and read back only while that key is still
// current, so switching task/chain never flashes the previous one's data (and no effect needs
// to reset state synchronously).
import { useEffect, useId, useState, type RefObject } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHAIN_NODE_COLUMNS, RUN_STEP_COLUMNS, type ChainNode, type ChainTask, type RunLite, type RunStep } from './types';

const RUN_COLUMNS = 'id, status, trigger_source, started_at, ended_at';
const RUN_POLL_MS = 4000;

const byStep = (a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number;
const byStart = (a: RunStep, b: RunStep) => a.step_number - b.step_number || new Date(a.started_at).getTime() - new Date(b.started_at).getTime();

function upsert<T extends { id: string }>(list: T[], row: T, sort: (a: T, b: T) => number): T[] {
  return (list.some(r => r.id === row.id) ? list.map(r => (r.id === row.id ? row : r)) : [...list, row]).sort(sort);
}

function mergeById<T extends { id: string }>(fetched: T[], live: T[], sort: (a: T, b: T) => number): T[] {
  const map = new Map(fetched.map(r => [r.id, r]));
  for (const r of live) map.set(r.id, r);
  return Array.from(map.values()).sort(sort);
}

export interface TaskChainData {
  chainId: string | null;
  nodes: ChainNode[];
  /** the nodes belong to a chain the planner is still building (the task has no active chain yet) */
  draft: boolean;
  run: RunLite | null;
  steps: RunStep[];
}

/** `enabled` = false (a collapsed card) loads nothing and opens no realtime connection. */
export function useTaskChain(task: ChainTask, live: boolean, enabled = true): TaskChainData {
  const uid = useId();
  const needDraft = !task.active_chain_id && (task.status === 'pending' || task.status === 'planning' || task.status === 'failed');

  // 1. Which chain is being built? (only while the task has no active chain)
  const [draftState, setDraftState] = useState<{ taskId: string; chainId: string | null } | null>(null);
  useEffect(() => {
    if (!needDraft || !enabled) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('task_chains').select('id').eq('task_id', task.id).eq('status', 'planning').order('created_at', { ascending: false }).limit(1);
      if (!cancelled) setDraftState(prev => ({ taskId: task.id, chainId: (data?.[0]?.id as string | undefined) ?? (prev?.taskId === task.id ? prev.chainId : null) }));
    })();
    if (!live) return () => { cancelled = true; };
    const channel = supabase
      .channel(`rs-chains:${task.id}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_chains', filter: `task_id=eq.${task.id}` }, payload => {
        const row = payload.new as { id?: string; status?: string } | undefined;
        if (cancelled || !row?.id || row.status !== 'planning') return;
        setDraftState({ taskId: task.id, chainId: row.id });
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [needDraft, enabled, live, task.id, task.status, uid]);

  const draftChainId = needDraft && draftState?.taskId === task.id ? draftState.chainId : null;
  const chainId = task.active_chain_id ?? draftChainId;

  // 2. The chain's nodes, streaming.
  const [nodesState, setNodesState] = useState<{ chainId: string; nodes: ChainNode[] } | null>(null);
  useEffect(() => {
    if (!chainId || !enabled) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('task_chain_nodes').select(CHAIN_NODE_COLUMNS).eq('chain_id', chainId).order('step_number');
      if (cancelled) return;
      const fetched = (data as ChainNode[]) ?? [];
      setNodesState(prev => ({ chainId, nodes: prev?.chainId === chainId ? mergeById(fetched, prev.nodes, byStep) : fetched }));
    })();
    if (!live) return () => { cancelled = true; };
    const channel = supabase
      .channel(`rs-nodes:${chainId}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_chain_nodes', filter: `chain_id=eq.${chainId}` }, payload => {
        if (cancelled) return;
        if (payload.eventType === 'DELETE') {
          const gone = (payload.old as { id?: string }).id;
          if (gone) setNodesState(prev => (prev?.chainId === chainId ? { chainId, nodes: prev.nodes.filter(n => n.id !== gone) } : prev));
          return;
        }
        const row = payload.new as ChainNode;
        setNodesState(prev => ({ chainId, nodes: upsert(prev?.chainId === chainId ? prev.nodes : [], row, byStep) }));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [chainId, enabled, live, task.status, uid]);

  // 3. The latest run. Streams over realtime (a run starting, going stuck, resuming, finishing),
  //    is re-read whenever the task row changes, and is polled while the task is running as a
  //    safety net -- a missed event must never leave a live run looking idle.
  const [runState, setRunState] = useState<{ taskId: string; run: RunLite | null } | null>(null);
  useEffect(() => {
    if (!task.active_chain_id || !enabled) return;
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('task_runs').select(RUN_COLUMNS).eq('task_id', task.id).not('status', 'in', '(queued,skipped)').order('started_at', { ascending: false }).limit(1);
      if (!cancelled) setRunState({ taskId: task.id, run: (data?.[0] as RunLite | undefined) ?? null });
    };
    void load();
    if (!live) return () => { cancelled = true; };

    const channel = supabase
      .channel(`rs-runs:${task.id}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_runs', filter: `task_id=eq.${task.id}` }, payload => {
        if (cancelled || payload.eventType === 'DELETE') return;
        const row = payload.new as RunLite;
        // A cron slot waiting for a start slot ('queued') or one that did not run ('skipped') is not a run to show.
        if ((row.status as string) === 'queued' || (row.status as string) === 'skipped') return;
        setRunState(prev => {
          const current = prev?.taskId === task.id ? prev.run : null;
          // an older run's late update must not replace the newer run being shown
          if (current && current.id !== row.id && new Date(row.started_at).getTime() < new Date(current.started_at).getTime()) return prev;
          return { taskId: task.id, run: { id: row.id, status: row.status, trigger_source: row.trigger_source, started_at: row.started_at, ended_at: row.ended_at } };
        });
      })
      .subscribe();
    const poll = task.status === 'running' ? setInterval(() => { void load(); }, RUN_POLL_MS) : null;
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [task.id, task.active_chain_id, task.status, task.updated_at, enabled, live, uid]);
  const run = task.active_chain_id && runState?.taskId === task.id ? runState.run : null;

  // 4. That run's steps, streaming.
  const runId = run?.id ?? null;
  const [stepsState, setStepsState] = useState<{ runId: string; steps: RunStep[] } | null>(null);
  useEffect(() => {
    if (!runId || !enabled) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('task_run_steps').select(RUN_STEP_COLUMNS).eq('run_id', runId).order('step_number').order('started_at');
      if (cancelled) return;
      const fetched = (data as RunStep[]) ?? [];
      setStepsState(prev => ({ runId, steps: prev?.runId === runId ? mergeById(fetched, prev.steps, byStart) : fetched }));
    })();
    if (!live) return () => { cancelled = true; };
    const channel = supabase
      .channel(`rs-steps:${runId}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_run_steps', filter: `run_id=eq.${runId}` }, payload => {
        if (cancelled || payload.eventType === 'DELETE') return;
        setStepsState(prev => ({ runId, steps: upsert(prev?.runId === runId ? prev.steps : [], payload.new as RunStep, byStart) }));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [runId, enabled, live, uid]);

  return {
    chainId,
    nodes: chainId && nodesState?.chainId === chainId ? nodesState.nodes : [],
    draft: !task.active_chain_id && chainId !== null,
    run,
    steps: runId && stepsState?.runId === runId ? stepsState.steps : [],
  };
}

/** One finished run: its steps and the nodes they ran (a repair may have moved the run onto a newer chain). */
export function useRunSnapshot(runId: string, chainId: string | null, enabled: boolean): { nodes: ChainNode[]; steps: RunStep[]; ready: boolean } {
  const [state, setState] = useState<{ runId: string; nodes: ChainNode[]; steps: RunStep[] } | null>(null);
  useEffect(() => {
    if (!enabled || !chainId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: stepData } = await supabase.from('task_run_steps').select(RUN_STEP_COLUMNS).eq('run_id', runId).order('step_number').order('started_at');
      const steps = ((stepData as RunStep[]) ?? []).sort(byStart);
      const latestByStep = new Map<number, RunStep>();
      for (const s of steps) latestByStep.set(s.step_number, s); // sorted ascending, so the last write is the newest attempt
      const nodeIds = Array.from(new Set(Array.from(latestByStep.values()).map(s => s.node_id)));
      const { data: ranNodes } = nodeIds.length
        ? await supabase.from('task_chain_nodes').select(`${CHAIN_NODE_COLUMNS}, chain_id`).in('id', nodeIds)
        : { data: [] as (ChainNode & { chain_id: string })[] };
      const nodeById = new Map(((ranNodes as (ChainNode & { chain_id: string })[]) ?? []).map(n => [n.id, n]));

      const nodes: ChainNode[] = [];
      let tailChain = chainId;
      let maxRan = 0;
      for (const [stepNumber, s] of Array.from(latestByStep.entries()).sort((a, b) => a[0] - b[0])) {
        const node = nodeById.get(s.node_id);
        if (!node) continue;
        nodes.push(node);
        maxRan = stepNumber;
        tailChain = node.chain_id ?? tailChain;
      }
      // Steps the run never reached come from the chain it was last executing.
      const { data: tail } = await supabase.from('task_chain_nodes').select(CHAIN_NODE_COLUMNS).eq('chain_id', tailChain).gt('step_number', maxRan).order('step_number');
      nodes.push(...((tail as ChainNode[]) ?? []));
      if (!cancelled) setState({ runId, nodes, steps });
    })();
    return () => { cancelled = true; };
  }, [runId, chainId, enabled]);
  const ready = state?.runId === runId;
  return { nodes: ready ? state.nodes : [], steps: ready ? state.steps : [], ready };
}

export function useInViewOnce(ref: RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (seen || !node) return;
    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setSeen(true);
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}
