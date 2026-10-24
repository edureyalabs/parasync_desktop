// components/projects/projectModel.ts
// Turns a project's rows (plan, journal, tasks) into what the views draw: step beads, work beads, and the wake-grouped timeline.
import type { RailItem, BeadStatus } from './ProjectRail';
import type { JournalEntry, Project, ProjectTask } from './types';

export type WorkKind = 'tool' | 'task' | 'question' | 'decision';

export interface WorkItem {
  id: string;
  kind: WorkKind;
  label: string;
  detail: string;
  at: string;
  status: BeadStatus;
  taskId?: string;
  toolName?: string;
}

const TASK_ID = /\[([0-9a-f]{8}-[0-9a-f-]{27})\]/i;
const TOOL_NAME = /'([^']+)'/;

export function stepItems(project: Project): RailItem[] {
  return project.plan.map((s, i) => ({
    id: s.id,
    label: `${i + 1}. ${s.title}`,
    status: s.status === 'done' ? 'done' : s.status === 'doing' ? 'doing' : s.status === 'skipped' ? 'skipped' : 'todo',
    kind: 'step',
    title: `Step ${i + 1}: ${s.title}${s.note ? ` — ${s.note}` : ''}`,
  }));
}

function taskStatus(t: ProjectTask | undefined): BeadStatus {
  if (!t) return 'done';
  if (t.status === 'completed') return 'done';
  if (t.status === 'failed') return 'failed';
  if (t.status === 'cancelled') return 'skipped';
  if (t.status === 'running' || t.status === 'planning' || t.status === 'pending') return 'doing';
  return 'todo';
}

function clip(text: string, n: number): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
}

/** The things the project actually did, oldest first: tools it built or changed, tasks it started, questions it asked, decisions it made. */
export function workItems(journal: JournalEntry[], tasks: ProjectTask[]): WorkItem[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const seenTasks = new Set<string>();
  const items: WorkItem[] = [];
  for (const e of journal) {
    if (e.kind === 'tool') {
      const m = e.content.match(/^(Built|Changed|Deleted) tool/);
      if (!m) continue;
      const name = e.content.match(TOOL_NAME)?.[1] ?? 'tool';
      items.push({ id: `j-${e.id}`, kind: 'tool', label: name, detail: e.content, at: e.created_at, status: 'done', toolName: m[1] === 'Deleted' ? undefined : name });
    } else if (e.kind === 'task') {
      const id = e.content.match(TASK_ID)?.[1];
      const t = id ? byId.get(id) : undefined;
      if (id) seenTasks.add(id);
      items.push({ id: `j-${e.id}`, kind: 'task', label: clip(t?.definition ?? e.content.replace(/^Created task \[[^\]]*\]:\s*/, ''), 40), detail: e.content, at: e.created_at, status: taskStatus(t), taskId: id });
    } else if (e.kind === 'question' || e.kind === 'decision') {
      items.push({ id: `j-${e.id}`, kind: e.kind, label: clip(e.content, 40), detail: e.content, at: e.created_at, status: 'done' });
    }
  }
  for (const t of tasks) {
    if (seenTasks.has(t.id)) continue;
    items.push({ id: `t-${t.id}`, kind: 'task', label: clip(t.definition, 40), detail: t.definition, at: t.created_at, status: taskStatus(t), taskId: t.id });
  }
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function workRail(items: WorkItem[]): RailItem[] {
  return items.map(w => ({
    id: w.id, label: w.label, status: w.status, kind: w.kind,
    title: `${w.kind === 'tool' ? 'Tool' : w.kind === 'task' ? 'Task' : w.kind === 'question' ? 'Question' : 'Decision'}: ${w.label}`,
  }));
}

/** Journal lines that belong to a plan step (the project agent writes "Step N (title) done …"). Best effort: empty when none match. */
export function stepJournal(journal: JournalEntry[], stepNumber: number): JournalEntry[] {
  const re = new RegExp(`^Step ${stepNumber}\\b`);
  return journal.filter(e => e.kind === 'progress' && re.test(e.content));
}

export interface WakeGroup { key: string; label: string; at: string; entries: JournalEntry[] }

/** Everything the project wrote, oldest first, in one group per wake. `keyOnly` hides the plan text and routine tool tests. */
export function wakeGroups(journal: JournalEntry[], keyOnly: boolean): WakeGroup[] {
  const groups: WakeGroup[] = [];
  for (const e of journal) {
    if (keyOnly && (e.kind === 'plan' || (e.kind === 'tool' && e.content.startsWith('Tested')))) continue;
    const last = groups[groups.length - 1];
    if (last && last.key === String(e.wake_no ?? 'x')) { last.entries.push(e); continue; }
    const label = e.wake_no != null ? `Wake ${e.wake_no}` : /created/i.test(e.content) ? 'Started' : 'Closed';
    groups.push({ key: String(e.wake_no ?? 'x'), label, at: e.created_at, entries: [e] });
  }
  return groups;
}

export function durationText(from: string, to: string | null): string | null {
  if (!to) return null;
  const minutes = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return 'under a minute';
  if (minutes < 90) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m && h < 10 ? `${h}h ${m}m` : `${h}h`;
}
