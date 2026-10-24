// components/projects/projectStatus.ts
// "What is this project doing right now?", worked out from the project row, its wakes, the events waiting and its tasks.
import { span, when } from './format';
import type { PendingEvent, Project, ProjectTask, ProjectWake } from './types';

export type Tone = 'working' | 'waiting' | 'warn' | 'stopped';
export interface NowStatus { tone: Tone; headline: string; detail?: string }

const STALE_MS = 150_000;      // the engine treats a wake silent this long as dead and releases it

export const EVENT_WORDS: Record<string, string> = {
  start: 'the start', task_done: 'a task finishing', task_failed: 'a task failing', user_reply: 'your answer', user_message: 'your message',
  timer: 'its own timer', deadline: 'the final wake', resume: 'your Resume',
};

export function eventWords(kinds: string[] | undefined): string {
  const words = [...new Set((kinds ?? []).map(k => EVENT_WORDS[k] ?? k))];
  return words.length ? words.join(', ') : 'an event';
}

export function describeNow(project: Project, wakes: ProjectWake[], pending: PendingEvent[], tasks: ProjectTask[], nowMs: number = Date.now()): NowStatus | null {
  if (project.status === 'completed' || project.status === 'cancelled') return null;
  if (project.status === 'failed' || project.status === 'expired') {
    return { tone: 'stopped', headline: project.status === 'failed' ? 'Stopped: it could not carry on.' : 'Stopped: its time ran out.', detail: project.last_error ?? undefined };
  }
  if (project.hold_reason) return { tone: 'warn', headline: 'Paused', detail: project.hold_reason };
  if (project.status === 'scheduled') return { tone: 'waiting', headline: `Starts ${when(project.starts_at)}` };

  const running = wakes.find(w => w.status === 'running');
  const beat = project.heartbeat_at ? new Date(project.heartbeat_at).getTime() : null;
  if (project.claimed_at && running) {
    const quiet = beat != null ? nowMs - beat : 0;
    if (quiet > STALE_MS) {
      return { tone: 'warn', headline: `Wake ${running.wake_no} has gone quiet`, detail: `No sign of life for ${span(new Date(beat as number).toISOString(), nowMs)}. If its process was restarted it is picked up again automatically.` };
    }
    const final = running.reason?.final;
    return { tone: 'working', headline: `${final ? 'Final wake' : `Wake ${running.wake_no}`} is working`, detail: `Started ${span(running.started_at, nowMs)} ago, woken by ${eventWords(running.reason?.events)}.` };
  }
  if (pending.some(e => e.kind === 'deadline')) return { tone: 'warn', headline: 'A final wake is queued', detail: 'It will report what got done and what did not, then the project closes.' };
  if (project.retry_at && new Date(project.retry_at).getTime() > nowMs) {
    return { tone: 'warn', headline: `The last wake failed${project.failed_wakes ? ` (${project.failed_wakes} in a row)` : ''}`, detail: `Trying again ${when(project.retry_at)}.${project.last_error ? ` ${project.last_error}` : ''}` };
  }
  if (pending.length > 0) return { tone: 'working', headline: 'About to wake', detail: `Waiting events: ${eventWords(pending.map(e => e.kind))}.` };
  const live = tasks.filter(t => ['pending', 'planning', 'planned', 'running'].includes(t.status));
  if (live.length > 0) return { tone: 'waiting', headline: `Waiting for ${live.length} task${live.length === 1 ? '' : 's'} to finish`, detail: 'It wakes by itself when one reports back.' };
  if (project.next_wake_at) return { tone: 'waiting', headline: `Sleeping until ${when(project.next_wake_at)}`, detail: 'Its own timer wakes it.' };
  return { tone: 'waiting', headline: 'Waiting', detail: 'For your answer or for something to happen.' };
}
