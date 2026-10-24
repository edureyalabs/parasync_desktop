// components/projects/ProjectHistoryRow.tsx
'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { followupBeads, followupTitle } from './FollowupCard';
import { when } from './format';
import ProjectBadge from './ProjectBadge';
import ProjectPanel from './ProjectPanel';
import ProjectRail from './ProjectRail';
import ResumeButton from './ResumeButton';
import { durationText, stepItems } from './projectModel';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, PROJECT_LINE, RED, RED_BG, SANS, SOFT } from './tokens';
import type { Project } from './types';

function outcomeOf(p: Project): { label: string; fg: string; bg: string; accent: string } {
  if (p.status === 'completed') return p.outcome === 'partial'
    ? { label: 'Partial', fg: BRASS, bg: BRASS_SOFT, accent: '#C9A24D' }
    : { label: 'Completed', fg: GREEN, bg: GREEN_BG, accent: '#8DBA9A' };
  if (p.status === 'failed') return { label: 'Failed', fg: RED, bg: RED_BG, accent: '#D9A196' };
  if (p.status === 'expired') return { label: 'Ran out of time', fg: BRASS, bg: BRASS_SOFT, accent: '#C9A24D' };
  return { label: 'Cancelled', fg: MUTED, bg: '#F0EEE5', accent: '#DAD5C5' };
}

const BTN: React.CSSProperties = { background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4, flexShrink: 0 };

// One finished project or follow-up in the Runsheet's History: how it ended, what it cost in time and work, a thin rail of its
// plan, and its report on demand. A project can also be opened in the panel (the map of what it built and ran, the timeline);
// a follow-up is just a note and a reply, so it only shows the reply.
export default function ProjectHistoryRow({ project }: { project: Project }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const followup = project.kind === 'followup';
  const outcome = outcomeOf(project);
  const text = project.report || project.last_error || '';
  const took = durationText(project.created_at, project.ended_at);
  const finishedOk = project.status === 'completed';
  const rail = followup ? followupBeads(project, finishedOk) : stepItems(project);
  const stats = followup
    ? [project.task_count > 0 ? `${project.task_count} task${project.task_count === 1 ? '' : 's'}` : null]
    : [`${project.wake_count} wake${project.wake_count === 1 ? '' : 's'}`, `${project.task_count} task${project.task_count === 1 ? '' : 's'}`, took];

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${outcome.accent}`, boxShadow: `inset 0 2px 0 ${PROJECT_LINE}`, borderRadius: 6, padding: '0.95rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: '0.88rem', color: INK, margin: '0 0 0.45rem', lineHeight: 1.55, ...(followup ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>
            {followup ? followupTitle(project.title) : project.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <ProjectBadge followup={followup} />
            <span style={{ fontFamily: MONO, fontSize: '0.63rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 3, color: outcome.fg, background: outcome.bg, whiteSpace: 'nowrap' }}>{outcome.label}</span>
            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: MUTED }}>{when(project.ended_at ?? project.ends_at)}</span>
            {stats.filter(Boolean).length > 0 && <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: MUTED }}>{stats.filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0 }}>
          {!followup && (project.status === 'failed' || project.status === 'expired') && <ResumeButton projectId={project.id} small />}
          {!followup && <button onClick={() => setPanelOpen(true)} style={BTN}>View map</button>}
          {text && <button onClick={() => setReportOpen(o => !o)} style={BTN}>{reportOpen ? (followup ? 'Hide reply' : 'Hide report') : followup ? 'Show reply' : project.report ? 'Show report' : 'Show reason'}</button>}
        </div>
      </div>
      {rail.length > 0 && <div style={{ marginTop: '0.7rem' }}><ProjectRail items={rail} ariaLabel={followup ? 'Follow-up' : 'Plan'} /></div>}
      {reportOpen && text && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.8rem', borderTop: `1px solid ${LINE}`, fontSize: '0.82rem', lineHeight: 1.65, color: SOFT, overflowWrap: 'anywhere' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
      {panelOpen && <ProjectPanel project={project} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}
