// components/browser-jobs/jobModel.ts
// How a Browser Access job reads in the Runsheet: its name, what each step looks like as a bead, and the one-line caption under the rail.
import { toolIconIfKnown } from '@/components/icons/toolIcons';
import type { RailBead } from '@/components/runsheet/ChainRail';
import type { BeadState, GlyphKey } from '@/components/runsheet/tokens';
import type { AccessRef, BrowserJob, BrowserJobStep } from './types';
import { LIVE_STATUSES } from './types';

export const KIND_LABEL: Record<string, string> = {
  onboard: 'Setting up the login', test: 'Testing the login', learn: 'Learning the site', research: 'Looking for tools', build: 'Building tools',
  study: 'Studying the site', condense: 'Condensing the manual',
};

export function accessName(access: AccessRef | undefined): string {
  return access?.label || access?.name || 'a site';
}

export function jobTitle(job: BrowserJob, access: AccessRef | undefined): string {
  return `${KIND_LABEL[job.kind] ?? 'Browser job'} · ${accessName(access)}`;
}

export function isLive(job: BrowserJob): boolean {
  return LIVE_STATUSES.includes(job.status);
}

const GUIDE_WRITE = new Set(['write_site_guide', 'set_guide_overview']);
const GUIDE_READ = new Set(['read_site_guide', 'read_node_learning', 'read_exploration_call']);

/** The tool or action a step is about: the title up to the first colon. */
function stepName(step: BrowserJobStep): string {
  return step.title.split(':')[0].trim();
}

function glyphFor(step: BrowserJobStep): GlyphKey {
  const name = stepName(step).toLowerCase().replace(/ /g, '_');
  if (step.kind === 'finish') return step.status === 'failed' ? 'cross' : 'finish';
  if (GUIDE_WRITE.has(name)) return 'replace';
  if (name === 'remove_site_guide' || name === 'remove_guide') return 'remove';
  if (GUIDE_READ.has(name) || /^(reading|collected|read)/i.test(step.title)) return 'explore';
  if (/^(propos|saved|building|tested|save|test)/i.test(step.title)) return 'add';
  return 'tool';
}

function stateFor(step: BrowserJobStep, isLastOfLiveJob: boolean): BeadState {
  if (step.status === 'failed') return 'failed';
  if (isLastOfLiveJob) return 'running';
  return 'completed';
}

function shortLabel(step: BrowserJobStep): string {
  const name = stepName(step).replace(/^browser_access_.*/, 'open site');
  const tail = step.title.includes(':') ? step.title.slice(step.title.indexOf(':') + 1).trim() : '';
  const base = (tail || name).replace(/_/g, ' ');
  return base.length > 18 ? base.slice(0, 17) + '…' : base;
}

export function beadsFor(steps: BrowserJobStep[], live: boolean): RailBead[] {
  return steps.map((step, i) => {
    const name = stepName(step);
    const known = toolIconIfKnown(name);
    return {
      id: step.id,
      label: shortLabel(step),
      sublabel: step.kind === 'finish' ? 'result' : undefined,
      glyph: glyphFor(step),
      icon: known ?? undefined,
      state: stateFor(step, live && i === steps.length - 1),
      title: step.title + (step.error ? ` — ${step.error}` : ''),
    };
  });
}

export function elapsed(job: BrowserJob): string {
  const end = job.ended_at ? new Date(job.ended_at).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(job.started_at).getTime()) / 1000));
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 6) / 10} h`;
}

/** One line on where the job is, or how it ended. */
export function caption(job: BrowserJob, steps: BrowserJobStep[]): string {
  if (job.status === 'queued') {
    const retry = job.next_attempt_at && new Date(job.next_attempt_at).getTime() > Date.now();
    return retry ? (job.error || 'Trying again shortly') : 'Waiting to start';
  }
  if (job.status === 'awaiting_credentials') return 'Waiting for the sign-in details';
  if (job.status === 'running') return steps.length ? `Working: ${steps[steps.length - 1].title}` : 'Starting';
  if (job.status === 'failed') return job.error === 'cancelled' ? 'Cancelled' : (job.error || 'Did not finish');
  const finish = [...steps].reverse().find(s => s.kind === 'finish');
  return finish?.output_excerpt?.split('\n')[0] || 'Finished';
}
