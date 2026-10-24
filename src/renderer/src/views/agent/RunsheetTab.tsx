// src/renderer/src/views/agent/RunsheetTab.tsx
// This person's own tasks, shifts and projects with the agent (each person sees only their own, the owner included).
import { Chip } from '@/components/ui';
import { Empty, Loaded, Panel, Row, TabPage, WebNote, dateTime } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface TaskRow { id: string; definition: string; trigger_type: string; cron_expression: string | null; next_run_at: string | null; status: string; run_count: number; last_run_at: string | null; last_error: string | null; delivery: string }
interface ShiftRow { id: string; name: string | null; definition: string; status: string; next_start_at: string | null; last_error: string | null }
interface ProjectRow { id: string; title: string; goal: string | null; status: string; next_wake_at: string | null; ends_at: string | null; task_count: number; last_error: string | null; outcome: string | null }
interface Work { tasks: TaskRow[]; shifts: ShiftRow[]; projects: ProjectRow[] }

const TONE: Record<string, 'green' | 'brass' | 'red' | 'neutral' | 'blue'> = {
  running: 'green', active: 'green', planning: 'blue', planned: 'brass', pending: 'brass', scheduled: 'brass',
  failed: 'red', stopped: 'red', completed: 'neutral', cancelled: 'neutral', retired: 'neutral',
};
const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

function Status({ status }: { status: string }) {
  return <Chip label={human(status)} tone={TONE[status] ?? 'neutral'} />;
}

export function RunsheetTab({ agentId }: TabProps) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const state = useAsync<Work>(async () => {
    if (!uid) throw new Error('You are signed out.');
    const [tasks, shifts, projects] = await Promise.all([
      supabase.from('tasks').select('id, definition, trigger_type, cron_expression, next_run_at, status, run_count, last_run_at, last_error, delivery').eq('agent_id', agentId).eq('created_by', uid).is('project_id', null).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(50),
      supabase.from('shifts').select('id, name, definition, status, next_start_at, last_error').eq('agent_id', agentId).eq('created_by', uid).is('retired_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('agent_projects').select('id, title, goal, status, next_wake_at, ends_at, task_count, last_error, outcome').eq('agent_id', agentId).eq('created_by', uid).eq('kind', 'project').order('created_at', { ascending: false }).limit(50),
    ]);
    if (tasks.error || shifts.error || projects.error) throw new Error('Your runsheet could not be loaded.');
    return { tasks: (tasks.data ?? []) as TaskRow[], shifts: (shifts.data ?? []) as ShiftRow[], projects: (projects.data ?? []) as ProjectRow[] };
  }, [agentId, uid]);

  return (
    <TabPage title="Runsheet" subtitle="The work you have handed to this agent: tasks, shifts and projects.">
      <Loaded state={state}>
        {(w) => (
          <>
            <Panel title="Tasks" subtitle="A job planned once and run the same way each time, once or on a schedule.">
              {w.tasks.length === 0 ? <Empty>No tasks yet. Ask the agent in chat to set one up.</Empty> : w.tasks.map((t, i) => (
                <Row
                  key={t.id} last={i === w.tasks.length - 1} primary={clip(t.definition, 160)}
                  secondary={<>
                    {t.cron_expression ? <span style={{ fontFamily: MONO }}>{t.cron_expression}</span> : human(t.trigger_type)}
                    {t.next_run_at && t.status !== 'completed' ? ` · next ${dateTime(t.next_run_at)}` : ''}
                    {t.last_run_at ? ` · last ${dateTime(t.last_run_at)}` : ''} · {t.run_count} run{t.run_count === 1 ? '' : 's'}
                    {t.last_error && <span style={{ display: 'block', color: C.red, marginTop: 2 }}>{clip(t.last_error, 180)}</span>}
                  </>}
                  right={<><Chip label={`To ${t.delivery === 'notification' ? 'feed' : t.delivery}`} /><Status status={t.status} /></>}
                />
              ))}
            </Panel>

            <Panel title="Shifts" subtitle="A goal and a time window; the agent decides the rest and ends with a report.">
              {w.shifts.length === 0 ? <Empty>No shifts yet.</Empty> : w.shifts.map((s, i) => (
                <Row
                  key={s.id} last={i === w.shifts.length - 1} primary={s.name || clip(s.definition, 100)}
                  secondary={<>{s.next_start_at ? `Next starts ${dateTime(s.next_start_at)}` : 'Not scheduled'}{s.last_error && <span style={{ display: 'block', color: C.red, marginTop: 2 }}>{clip(s.last_error, 180)}</span>}</>}
                  right={<Status status={s.status} />}
                />
              ))}
            </Panel>

            <Panel title="Projects" subtitle="Large efforts a project agent keeps organised across many runs.">
              {w.projects.length === 0 ? <Empty>No projects yet.</Empty> : w.projects.map((p, i) => (
                <Row
                  key={p.id} last={i === w.projects.length - 1} primary={p.title} secondary={<>{p.goal ? clip(p.goal, 140) : ''}{` · ${p.task_count} task${p.task_count === 1 ? '' : 's'}`}{p.next_wake_at ? ` · next wake ${dateTime(p.next_wake_at)}` : ''}{p.last_error && <span style={{ display: 'block', color: C.red, marginTop: 2 }}>{clip(p.last_error, 180)}</span>}</>}
                  right={<Status status={p.status} />}
                />
              ))}
            </Panel>
          </>
        )}
      </Loaded>
      <WebNote path={`/agents/${agentId}/crons`}>The step-by-step runsheet for each run, and changing a task or schedule, are in the web app for now.</WebNote>
    </TabPage>
  );
}
