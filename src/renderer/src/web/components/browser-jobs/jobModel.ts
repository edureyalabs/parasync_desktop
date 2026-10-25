// components/browser-jobs/jobModel.ts
// How a Browser Access job reads in the Runsheet: its name, what each step looks like as a bead, and the one-line caption under the rail.
import { toolIconIfKnown } from '@/components/icons/toolIcons';
import type { RailBead, RailGhost } from '@/components/runsheet/ChainRail';
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
const GUIDE_READ = new Set(['read_site_guide', 'read_node_learning', 'read_exploration_call', 'read_source_call', 'read_browser_call', 'read_tool', 'show_canvas', 'probe']);
const SAVES = new Set(['save_draft', 'submit_plan', 'submit_draft', 'pass_tool', 'send_back', 'suggest_tool', 'revise_suggestion', 'set_contract', 'set_step', 'set_helpers', 'drop_step', 'submit_tool']);
const PHASE = /^(Plan|Build|Check|Study|Write|Verify) · (.+)$/;
const PHASE_TONE: Record<string, 'plan' | 'repair' | 'neutral'> = { Plan: 'plan', Build: 'neutral', Check: 'repair', Study: 'plan', Write: 'neutral', Verify: 'repair' };

/** A builder step's title is "Phase · what"; every other job's is just "what". */
function parts(step: BrowserJobStep): { phase: string | null; rest: string } {
  const m = PHASE.exec(step.title);
  return m ? { phase: m[1], rest: m[2] } : { phase: null, rest: step.title };
}

/** The tool or action a step is about: the title (without its phase) up to the first colon. */
function stepName(step: BrowserJobStep): string {
  return parts(step).rest.split(':')[0].trim();
}

function glyphFor(step: BrowserJobStep): GlyphKey {
  const name = stepName(step).toLowerCase().replace(/ /g, '_');
  const rest = parts(step).rest;
  if (step.kind === 'finish') return step.status === 'failed' ? 'cross' : 'finish';
  if (name === 'plan') return 'plan';
  if (GUIDE_WRITE.has(name)) return 'replace';
  if (name === 'remove_site_guide' || name === 'remove_guide') return 'remove';
  if (GUIDE_READ.has(name) || /^(reading|collected|read)/i.test(rest)) return 'explore';
  if (SAVES.has(name) || /^(propos|saved|building|tested|save|test)/i.test(rest)) return 'add';
  return 'tool';
}

function stateFor(step: BrowserJobStep): BeadState {
  return step.status === 'failed' ? 'failed' : 'completed';
}

function shortLabel(step: BrowserJobStep): string {
  const { rest } = parts(step);
  const name = stepName(step).replace(/^browser_access_.*/, 'open site');
  const tail = rest.includes(':') ? rest.slice(rest.indexOf(':') + 1).trim() : '';
  const base = (tail && !SAVES.has(name) && !['run_draft', 'run_step'].includes(name) ? tail : name).replace(/_/g, ' ');
  if (tail && ['set_step', 'run_step'].includes(name)) return (tail.length > 18 ? tail.slice(0, 17) + '…' : tail).replace(/_/g, ' ');
  return base.length > 18 ? base.slice(0, 17) + '…' : base;
}

/** One bead per recorded step (a step is written when it is over). A builder's phases (Study, Write, Verify) each start a labelled section of the rail.
 *  While the job is working, the rail ends with a "working" ghost bead: the live end. */
export function beadsFor(steps: BrowserJobStep[]): RailBead[] {
  let lastPhase: string | null = null;
  return steps.map(step => {
    const name = stepName(step);
    const known = toolIconIfKnown(name);
    const { phase } = parts(step);
    const section = phase && phase !== lastPhase ? { label: phase, tone: PHASE_TONE[phase] ?? 'neutral' } : undefined;
    if (phase) lastPhase = phase;
    return {
      id: step.id,
      label: shortLabel(step),
      sublabel: step.kind === 'finish' ? 'result' : undefined,
      glyph: glyphFor(step),
      icon: known ?? undefined,
      section,
      state: stateFor(step),
      title: step.title + (step.error ? ` — ${step.error}` : ''),
    };
  });
}

export function ghostFor(job: BrowserJob): RailGhost | null {
  return job.status === 'running' ? { label: 'working', tone: 'building' } : null;
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
  if (job.status === 'running') return steps.length ? `Working · after: ${steps[steps.length - 1].title}` : 'Starting';
  if (job.status === 'failed') return job.error === 'cancelled' ? 'Cancelled' : (job.error || 'Did not finish');
  const finish = [...steps].reverse().find(s => s.kind === 'finish');
  return finish?.output_excerpt?.split('\n')[0] || 'Finished';
}
