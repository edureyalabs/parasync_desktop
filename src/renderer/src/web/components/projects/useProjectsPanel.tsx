// components/projects/useProjectsPanel.tsx
'use client';

import { useState } from 'react';
import ConfirmModal from '@/components/shifts/ConfirmModal';
import FollowupCard from './FollowupCard';
import ProjectCard from './ProjectCard';
import { INK, SOFT } from './tokens';
import { LIVE, type Project } from './types';
import { useProjects } from './useProjects';

// An item of the Runsheet's Active list, ordered together with the tasks and shifts around it:
// rank 0 = working now, 1 = paused, 2 = scheduled (then by `at`).
export interface ProjectActiveEntry { key: string; rank: number; at: number; node: React.ReactNode }

// Everything the Runsheet needs from the projects system: the live cards for the Active list, the finished
// projects for History, and the cancel dialog.
export function useProjectsPanel(agentId: string) {
  const { projects, reload } = useProjects(agentId);
  const [cancelling, setCancelling] = useState<Project | null>(null);

  const cancel = async (project: Project): Promise<string | null> => {
    const resp = await fetch(`/api/projects/${project.id}/cancel`, { method: 'POST' }).catch(() => null);
    const data = resp ? await resp.json().catch(() => null) : null;
    if (!resp || !data?.ok) return data?.error ?? 'Could not cancel the project. Please try again.';
    await reload();
    return null;
  };

  const activeEntries: ProjectActiveEntry[] = projects
    .filter(p => LIVE.includes(p.status))
    .map(project => ({
      key: `project-${project.id}`,
      rank: project.hold_reason ? 1 : project.status === 'active' && project.kind !== 'followup' ? 0 : 2,
      at: new Date(project.kind === 'followup' ? (project.next_wake_at ?? project.starts_at) : project.status === 'scheduled' ? project.starts_at : project.ends_at).getTime(),
      node: project.kind === 'followup'
        ? <FollowupCard project={project} onCancel={() => setCancelling(project)} />
        : <ProjectCard project={project} onCancel={() => setCancelling(project)} />,
    }));

  const history = projects.filter(p => !LIVE.includes(p.status));

  const dialogs = cancelling && (
    <ConfirmModal
      title={cancelling.kind === 'followup' ? 'Cancel this follow-up?' : 'Cancel this project?'}
      body={<><strong style={{ color: INK, fontWeight: 500 }}>{cancelling.title}</strong> stops now<span style={{ color: SOFT }}> and its unfinished tasks are retired</span>. What it has already done stays done.</>}
      confirmLabel={cancelling.kind === 'followup' ? 'Cancel follow-up' : 'Cancel project'} keepLabel="Keep going"
      onConfirm={() => cancel(cancelling)} onClose={() => setCancelling(null)}
    />
  );

  return { activeEntries, history, dialogs };
}
