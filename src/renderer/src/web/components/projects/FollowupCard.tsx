// components/projects/FollowupCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { TaskChainBlock } from '@/components/runsheet/ChainBlock';
import { when, span } from './format';
import ProjectBadge from './ProjectBadge';
import ProjectRail, { type RailItem } from './ProjectRail';
import { INK, LINE, MONO, MUTED, PROJECT_FG, RED, SANS, SOFT } from './tokens';
import type { Project } from './types';
import { useProjectDetails } from './useProjects';

export function followupTitle(title: string): string {
  return title.replace(/^Follow-up:\s*/i, '');
}

/** scheduled → wakes → replies (→ a task, when it started one). `finished` fills them all. */
export function followupBeads(project: Project, finished: boolean, now: number = 0): RailItem[] {
  const waking = project.status === 'active' && !finished && (!project.next_wake_at || new Date(project.next_wake_at).getTime() <= now);
  const items: RailItem[] = [
    { id: 'scheduled', label: 'Scheduled', status: 'done', kind: 'step', icon: 'calendar-clock', title: 'Scheduled' },
    { id: 'wakes', label: 'Wakes', status: finished ? 'done' : waking ? 'doing' : 'todo', kind: 'step', icon: 'alarm-clock', title: 'The agent wakes up for it' },
  ];
  if (project.task_count > 0) items.push({ id: 'task', label: 'Task', status: finished ? 'done' : 'todo', kind: 'step', icon: 'list-checks', title: 'It started a task' });
  items.push({ id: 'replies', label: 'Replies', status: finished ? 'done' : 'todo', kind: 'step', icon: 'message-square', title: 'It replies in the chat' });
  return items;
}

// A live follow-up in the Runsheet's Active list: lighter than a project. It is a reminder to itself: when it wakes, what it will do,
// then one line when it has replied. Cancel is the only action.
export default function FollowupCard({ project, onCancel }: { project: Project; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 30000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, []);
  const details = useProjectDetails(project.id, open && project.task_count > 0, true);
  const at = project.next_wake_at;
  const waiting = Boolean(at) && new Date(at as string).getTime() > now;

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${PROJECT_FG}`, borderRadius: 6, padding: '0.85rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '0.86rem', color: INK, margin: '0 0 0.4rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{followupTitle(project.title)}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
            <ProjectBadge followup />
            <ProjectRail items={followupBeads(project, false, now)} ariaLabel="Follow-up progress" />
            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: MUTED }}>
              {waiting ? `wakes ${when(at)} · in ${span(at as string)}` : 'waking now'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0 }}>
          <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>{open ? 'Hide note' : 'Note'}</button>
          <button onClick={onCancel} style={{ background: 'none', border: '1px solid #E3C4BB', color: RED, padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: `1px solid ${LINE}` }}>
          <p style={{ fontSize: '0.78rem', color: SOFT, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{project.goal}</p>
          {details?.tasks.map(t => <div key={t.id} style={{ marginTop: '0.7rem' }}><TaskChainBlock task={t} live initial={{ expanded: false }} /></div>)}
        </div>
      )}
    </div>
  );
}
