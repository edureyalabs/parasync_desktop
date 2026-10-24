// components/projects/ProjectCard.tsx
'use client';

import { useState } from 'react';
import { when, span } from './format';
import ProjectBadge from './ProjectBadge';
import ProjectPanel from './ProjectPanel';
import ProjectRail from './ProjectRail';
import { stepItems } from './projectModel';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, PROJECT_FG, RED, SANS, SOFT } from './tokens';
import type { Project } from './types';

function Chip({ fg, bg, children }: { fg: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontFamily: MONO, fontSize: '0.63rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 3, color: fg, background: bg, whiteSpace: 'nowrap' }}>{children}</span>;
}

/** One line on where the project is: the step it is on, or what it is waiting for. */
function caption(project: Project): string {
  const steps = project.plan;
  if (project.hold_reason) return 'Paused';
  if (project.claimed_at) return `Working now${project.wake_count > 0 ? ` (wake ${project.wake_count})` : ''}`;
  if (project.retry_at && new Date(project.retry_at).getTime() > Date.now()) return 'The last wake failed; trying again shortly';
  if (project.status === 'scheduled') return `Starts ${when(project.starts_at)}`;
  if (steps.length === 0) return project.wake_count === 0 ? 'Getting started' : 'Working';
  const now = steps.findIndex(s => s.status === 'doing');
  const next = now >= 0 ? now : steps.findIndex(s => s.status === 'todo');
  if (next < 0) return 'All steps done, wrapping up';
  return `Step ${next + 1} of ${steps.length} · ${steps[next].title}`;
}

// A live project in the Runsheet's Active list: a thin bead rail for the plan and one line on where it is. Everything else
// (the map of what it built and ran, the timeline) opens in the panel. Read-only: the project agent writes everything.
export default function ProjectCard({ project, onCancel }: { project: Project; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  const scheduled = project.status === 'scheduled';
  const paused = Boolean(project.hold_reason);
  const steps = stepItems(project);

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${paused ? '#C9A24D' : PROJECT_FG}`, borderRadius: 6, padding: '0.95rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 500, color: INK, margin: '0 0 0.4rem', lineHeight: 1.5 }}>{project.title}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <ProjectBadge />
            {paused
              ? <Chip fg={BRASS} bg={BRASS_SOFT}>Paused</Chip>
              : scheduled ? <Chip fg={SOFT} bg="#F0EEE5">Scheduled</Chip> : <Chip fg={GREEN} bg={GREEN_BG}>In progress</Chip>}
            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: MUTED }}>ends {when(project.ends_at)} ({span(project.ends_at)} left)</span>
            {project.next_wake_at && !paused && <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: MUTED }}>checks again {when(project.next_wake_at)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0 }}>
          <button onClick={() => setOpen(true)} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Open</button>
          <button onClick={onCancel} style={{ background: 'none', border: '1px solid #E3C4BB', color: RED, padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.8rem', minWidth: 0 }}>
        <ProjectRail items={steps} ariaLabel={`Plan, ${steps.filter(s => s.status === 'done').length} of ${steps.length} steps done`} />
        <span style={{ fontSize: '0.74rem', color: SOFT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{caption(project)}</span>
      </div>

      {open && <ProjectPanel project={project} onClose={() => setOpen(false)} onCancel={() => { setOpen(false); onCancel(); }} />}
    </div>
  );
}
