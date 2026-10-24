// components/projects/ProjectPanel.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createClient } from '@/lib/supabase/client';
import { TaskChainBlock } from '@/components/runsheet/ChainBlock';
import { durationText, stepItems, stepJournal, wakeGroups, workItems, workRail, type WorkItem } from './projectModel';
import { when, span } from './format';
import ProjectBadge from './ProjectBadge';
import ProjectRail from './ProjectRail';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, PROJECT_FG, RED, RED_BG, SANS, SERIF, SOFT } from './tokens';
import { LIVE, type JournalEntry, type Project } from './types';
import { useProjectDetails } from './useProjects';
import { useProjectRuns } from './useProjectRuns';
import { describeNow } from './projectStatus';
import { NowBanner, WakeList } from './ProjectRuns';
import ResumeButton from './ResumeButton';

// The slide-over a project opens in: its goal, the plan as a bead rail, the work it did as a second rail (click a bead to open
// that task's real chain, a tool's code, a question or a decision), and the journal as a timeline grouped by wake.

const LABEL: React.CSSProperties = { fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: MUTED, margin: '0 0 0.45rem' };

const KIND_MARK: Record<string, { mark: string; color: string }> = {
  plan: { mark: '≡', color: '#3D5A6E' }, tool: { mark: '◈', color: '#3D5A6E' }, task: { mark: '☰', color: BRASS },
  progress: { mark: '✓', color: GREEN }, question: { mark: '?', color: '#B5651D' }, decision: { mark: '◆', color: PROJECT_FG },
  note: { mark: '•', color: SOFT }, system: { mark: '·', color: MUTED },
};

function statusChip(project: Project): { label: string; fg: string; bg: string } {
  if (project.status === 'completed') return project.outcome === 'partial' ? { label: 'Partial', fg: BRASS, bg: BRASS_SOFT } : { label: 'Completed', fg: GREEN, bg: GREEN_BG };
  if (project.status === 'failed') return { label: 'Failed', fg: RED, bg: RED_BG };
  if (project.status === 'expired') return { label: 'Ran out of time', fg: BRASS, bg: BRASS_SOFT };
  if (project.status === 'cancelled') return { label: 'Cancelled', fg: MUTED, bg: '#F0EEE5' };
  if (project.hold_reason) return { label: 'Paused', fg: BRASS, bg: BRASS_SOFT };
  if (project.status === 'scheduled') return { label: 'Scheduled', fg: SOFT, bg: '#F0EEE5' };
  return { label: 'In progress', fg: GREEN, bg: GREEN_BG };
}

function Chip({ fg, bg, children }: { fg: string; bg: string; children: React.ReactNode }) {
  return <span style={{ fontFamily: MONO, fontSize: '0.63rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 3, color: fg, background: bg, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Box({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, padding: '0.85rem 1rem' }}>{children}</div>;
}

function ToolCode({ agentId, name }: { agentId: string; name: string }) {
  const [state, setState] = useState<{ description: string; code: string } | 'none' | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const agentTool = await createClient().from('agent_created_tools').select('description, config').eq('agent_id', agentId).eq('name', name).limit(1).maybeSingle();
      const row = agentTool.data as { description: string | null; config: { code?: string; preamble?: string } } | null;
      if (cancelled) return;
      setState(row ? { description: row.description ?? '', code: [row.config?.preamble, row.config?.code].filter(Boolean).join('\n\n') } : 'none');
    })();
    return () => { cancelled = true; };
  }, [agentId, name]);
  if (state === null) return <p style={{ fontSize: '0.78rem', color: MUTED, margin: 0 }}>Loading the tool…</p>;
  if (state === 'none') return <p style={{ fontSize: '0.78rem', color: MUTED, margin: 0 }}>This tool no longer exists.</p>;
  return (
    <div>
      {state.description && <p style={{ fontSize: '0.8rem', color: SOFT, lineHeight: 1.6, margin: '0 0 0.5rem' }}>{state.description}</p>}
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#3A3830', padding: '0.25rem 0.6rem', fontSize: '0.72rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>
        {open ? 'Hide code' : 'View code'}
      </button>
      {open && (
        <pre style={{ fontFamily: MONO, fontSize: '0.72rem', lineHeight: 1.55, background: '#F7F6F2', border: `1px solid ${LINE}`, borderRadius: 4, padding: '0.7rem 0.9rem', margin: '0.6rem 0 0', overflowX: 'auto', color: INK }}>{state.code}</pre>
      )}
    </div>
  );
}

function Timeline({ journal }: { journal: JournalEntry[] }) {
  const [everything, setEverything] = useState(false);
  const groups = useMemo(() => wakeGroups(journal, !everything), [journal, everything]);
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <p style={{ ...LABEL, margin: 0 }}>Timeline</p>
        <div style={{ display: 'flex', gap: 2, background: '#EDEBE2', borderRadius: 999, padding: 2 }}>
          {([['Key moments', false], ['Everything', true]] as const).map(([label, value]) => (
            <button key={label} onClick={() => setEverything(value)} aria-pressed={everything === value}
              style={{ border: 'none', cursor: 'pointer', padding: '0.15rem 0.6rem', borderRadius: 999, fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase', background: everything === value ? INK : 'transparent', color: everything === value ? '#F7F6F2' : SOFT }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {groups.length === 0 ? <p style={{ fontSize: '0.78rem', color: MUTED, margin: 0 }}>Nothing written yet.</p> : groups.map(g => (
        <div key={`${g.key}-${g.at}`} style={{ marginBottom: '0.9rem' }}>
          <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: SOFT, margin: '0 0 0.3rem' }}>{g.label} <span style={{ color: MUTED }}>· {when(g.at)}</span></p>
          <div style={{ borderLeft: `1.5px solid ${LINE}`, marginLeft: 5, paddingLeft: '0.85rem' }}>
            {g.entries.map(e => {
              const k = KIND_MARK[e.kind] ?? KIND_MARK.note;
              const highlight = e.kind === 'question' || e.kind === 'decision';
              const dim = e.kind === 'system' || (e.kind === 'tool' && e.content.startsWith('Tested'));
              return (
                <div key={e.id} style={{ display: 'flex', gap: '0.5rem', margin: '0 0 0.3rem', padding: highlight ? '0.35rem 0.55rem' : 0, background: highlight ? '#fff' : 'transparent', border: highlight ? `1px solid ${LINE}` : 'none', borderRadius: 5 }}>
                  <span style={{ fontFamily: MONO, fontSize: '0.74rem', color: k.color, width: 12, flex: 'none', textAlign: 'center', lineHeight: 1.6 }}>{k.mark}</span>
                  <p style={{ fontSize: '0.78rem', lineHeight: 1.55, color: dim ? MUTED : SOFT, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{e.content}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function ProjectPanel({ project, onClose, onCancel }: { project: Project; onClose: () => void; onCancel?: () => void }) {
  const live = LIVE.includes(project.status);
  const details = useProjectDetails(project.id, true, live);
  const runs = useProjectRuns(project.id, true, live, `${project.wake_count}:${project.status}:${project.failed_wakes ?? 0}:${project.claimed_at ?? ''}`);
  const now = describeNow(project, runs?.wakes ?? [], runs?.pending ?? [], details?.tasks ?? []);
  const canResume = project.kind === 'project' && (project.status === 'failed' || project.status === 'expired');
  const [selected, setSelected] = useState<{ lane: 'step' | 'work'; id: string } | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const steps = useMemo(() => stepItems(project), [project]);
  const work = useMemo(() => (details ? workItems(details.journal, details.tasks) : []), [details]);
  const chip = statusChip(project);
  const took = durationText(project.starts_at, project.ended_at);
  const selectedStep = selected?.lane === 'step' ? project.plan.findIndex(s => s.id === selected.id) : -1;
  const selectedWork: WorkItem | undefined = selected?.lane === 'work' ? work.find(w => w.id === selected.id) : undefined;
  const selectedTask = selectedWork?.taskId ? details?.tasks.find(t => t.id === selectedWork.taskId) : undefined;
  const report = project.report || project.last_error || '';

  // Only ever rendered after a click, so `document` exists.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'flex-end', fontFamily: SANS }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(38,37,30,0.3)' }} />
      <aside role="dialog" aria-label={project.title} style={{ position: 'relative', width: 'min(760px, 100vw)', height: '100%', background: '#F7F6F2', boxShadow: '-12px 0 40px rgba(38,37,30,0.18)', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '1rem 1.4rem', borderBottom: `1px solid ${LINE}`, display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: '1.1rem', fontWeight: 500, color: '#514726', margin: '0 0 0.45rem', lineHeight: 1.35 }}>{project.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
              <ProjectBadge followup={project.kind === 'followup'} />
              <Chip fg={chip.fg} bg={chip.bg}>{chip.label}</Chip>
              <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: MUTED }}>
                {live ? `ends ${when(project.ends_at)} (${span(project.ends_at)} left)` : `${when(project.ended_at ?? project.ends_at)}${took ? ` · ran ${took}` : ''}`}
              </span>
              <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: MUTED }}>{project.wake_count} wake{project.wake_count === 1 ? '' : 's'} · {project.task_count} task{project.task_count === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: SOFT, fontSize: '1.3rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}>×</button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem 1.4rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {now && <NowBanner status={now} action={canResume ? <ResumeButton projectId={project.id} small /> : undefined} />}

          {report && (
            <section>
              <p style={LABEL}>{project.report ? 'Final report' : 'Why it stopped'}</p>
              <Box>
                <div style={{ fontSize: '0.82rem', lineHeight: 1.65, color: SOFT, overflowWrap: 'anywhere' }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown></div>
              </Box>
            </section>
          )}

          <section>
            <p style={LABEL}>Goal</p>
            <p style={{ fontSize: '0.8rem', color: SOFT, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', ...(goalOpen ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{project.goal}</p>
            {project.goal.length > 220 && <button onClick={() => setGoalOpen(o => !o)} style={{ background: 'none', border: 'none', color: MUTED, fontSize: '0.72rem', cursor: 'pointer', padding: '0.2rem 0' }}>{goalOpen ? 'Show less' : 'Show more'}</button>}
          </section>

          {steps.length > 0 && (
            <section>
              <p style={LABEL}>Plan</p>
              <ProjectRail items={steps} size="md" ariaLabel="Plan steps" selectedId={selected?.lane === 'step' ? selected.id : null}
                onSelect={id => setSelected(cur => (cur?.lane === 'step' && cur.id === id ? null : { lane: 'step', id }))} />
            </section>
          )}

          <section>
            <p style={LABEL}>Work</p>
            {!details ? <p style={{ fontSize: '0.78rem', color: MUTED, margin: 0 }}>Loading…</p>
              : work.length === 0 ? <p style={{ fontSize: '0.78rem', color: MUTED, margin: 0 }}>No tools built or tasks started yet.</p>
              : <ProjectRail items={workRail(work)} size="md" ariaLabel="Work done" selectedId={selected?.lane === 'work' ? selected.id : null}
                  onSelect={id => setSelected(cur => (cur?.lane === 'work' && cur.id === id ? null : { lane: 'work', id }))} />}
          </section>

          {selectedStep >= 0 && details && (
            <Box>
              <p style={{ fontSize: '0.85rem', fontWeight: 500, color: INK, margin: '0 0 0.3rem' }}>Step {selectedStep + 1}: {project.plan[selectedStep].title}</p>
              {project.plan[selectedStep].note && <p style={{ fontSize: '0.78rem', color: SOFT, lineHeight: 1.6, margin: '0 0 0.4rem' }}>{project.plan[selectedStep].note}</p>}
              {stepJournal(details.journal, selectedStep + 1).map(e => <p key={e.id} style={{ fontSize: '0.76rem', color: SOFT, lineHeight: 1.55, margin: '0 0 0.25rem', whiteSpace: 'pre-wrap' }}>{e.content}</p>)}
              {stepJournal(details.journal, selectedStep + 1).length === 0 && !project.plan[selectedStep].note && <p style={{ fontSize: '0.76rem', color: MUTED, margin: 0 }}>Nothing recorded for this step yet.</p>}
            </Box>
          )}

          {selectedWork && (
            <Box>
              <p style={{ fontSize: '0.85rem', fontWeight: 500, color: INK, margin: '0 0 0.4rem' }}>
                {selectedWork.kind === 'tool' ? `Tool: ${selectedWork.label}` : selectedWork.kind === 'task' ? 'Task' : selectedWork.kind === 'question' ? 'Question to you' : 'Decision'}
              </p>
              {selectedWork.kind === 'task' && (
                <>
                  <p style={{ fontSize: '0.78rem', color: SOFT, lineHeight: 1.6, margin: '0 0 0.7rem', whiteSpace: 'pre-wrap' }}>{selectedTask?.definition ?? selectedWork.detail}</p>
                  {selectedTask ? <TaskChainBlock task={selectedTask} live={live} initial={{ expanded: true }} /> : <p style={{ fontSize: '0.76rem', color: MUTED, margin: 0 }}>This task is no longer available.</p>}
                </>
              )}
              {selectedWork.kind === 'tool' && (selectedWork.toolName ? <ToolCode agentId={project.agent_id} name={selectedWork.toolName} /> : <p style={{ fontSize: '0.78rem', color: SOFT, margin: 0 }}>{selectedWork.detail}</p>)}
              {(selectedWork.kind === 'question' || selectedWork.kind === 'decision') && <p style={{ fontSize: '0.8rem', color: SOFT, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{selectedWork.detail}</p>}
            </Box>
          )}

          {runs ? <WakeList wakes={runs.wakes} /> : null}

          {details ? <Timeline journal={details.journal} /> : null}
        </div>

        {live && onCancel && (
          <footer style={{ padding: '0.8rem 1.4rem', borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onCancel} style={{ background: 'none', border: '1px solid #E3C4BB', color: RED, padding: '0.35rem 0.8rem', fontSize: '0.76rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Cancel project</button>
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}
