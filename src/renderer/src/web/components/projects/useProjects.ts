// components/projects/useProjects.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { JournalEntry, Project, ProjectTask } from './types';

// The signed-in person's projects for ONE agent, newest first. Live: reloads (debounced) whenever a project row changes.
// If the projects tables are not in the database yet, the list is simply empty.
export function useProjects(agentId: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user.id;
    if (!uid) { setProjects([]); setLoading(false); return; }
    const { data, error } = await supabase.from('agent_projects').select('*').eq('agent_id', agentId).eq('created_by', uid).order('created_at', { ascending: false }).limit(60);
    setProjects(error ? [] : ((data as Project[] | null) ?? []));
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => { if (!cancelled) await reload(); };
    void pull();
    const supabase = createClient();
    const channel = supabase
      .channel(`projects-${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_projects', filter: `agent_id=eq.${agentId}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void pull(), 400);
      })
      .subscribe();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [agentId, reload]);

  return { projects, loading, reload };
}

export interface ProjectDetails { journal: JournalEntry[]; tasks: ProjectTask[] }

const TASK_COLUMNS = 'id, definition, status, trigger_type, active_chain_id, next_run_at, updated_at, last_error, created_at';

/** A project's journal (oldest first) and tasks. */
export async function loadProjectDetails(projectId: string): Promise<ProjectDetails> {
  const supabase = createClient();
  const [journal, tasks] = await Promise.all([
    supabase.from('project_journal').select('id, project_id, wake_no, kind, content, created_at').eq('project_id', projectId).order('created_at', { ascending: true }).limit(400),
    supabase.from('tasks').select(TASK_COLUMNS).eq('project_id', projectId).order('created_at', { ascending: true }),
  ]);
  return { journal: (journal.data as JournalEntry[] | null) ?? [], tasks: (tasks.data as ProjectTask[] | null) ?? [] };
}

/** Details of one project, kept live: reloads (debounced) when its journal or tasks change, with a slow poll as a fallback while it is running. */
export function useProjectDetails(projectId: string, enabled: boolean, live: boolean) {
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pull = async () => {
      const next = await loadProjectDetails(projectId);
      if (!cancelled) setDetails(next);
    };
    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void pull(), 400);
    };
    void pull();
    const supabase = createClient();
    const channel = supabase
      .channel(`project-details-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_journal', filter: `project_id=eq.${projectId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, soon)
      .subscribe();
    const poll = live ? setInterval(() => void pull(), 15000) : null;
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (poll) clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [projectId, enabled, live]);

  return details;
}
