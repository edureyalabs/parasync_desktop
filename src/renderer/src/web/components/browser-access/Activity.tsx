// components/browser-access/Activity.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon, type IconName } from '@/components/icons/Icon';
import { ChainRail, type RailBead } from '@/components/runsheet/ChainRail';
import type { BeadState } from '@/components/runsheet/tokens';
import { C, MONO } from '@/components/account/tokens';
import { Chip } from './ui';
import type { Run, Step } from './types';

// The Activity tab: the latest setup / test / study run. While a SETUP run is going (or has failed) its five stages are drawn as the same small bead rail
// the Runsheet uses, so you can see where it is; every other run is a one-line summary. Under it the run's steps, newest last.

const PHASES: { label: string; icon: IconName; color: string }[] = [
  { label: 'Read page', icon: 'file-search', color: '#3D5A6E' },
  { label: 'Your details', icon: 'key-round', color: '#A17F3A' },
  { label: 'Sign in', icon: 'log-in', color: '#2F6F8F' },
  { label: 'Explore', icon: 'compass', color: '#5F4A8C' },
  { label: 'Manual', icon: 'book-open', color: '#3D7A4F' },
];

function phaseReached(steps: Step[], run: Run | null): number {
  const ok = (t: string) => steps.some(s => s.title === t && s.status === 'completed');
  if (run?.status === 'done' || ok('save_profile')) return 5;
  if (ok('attempt_login')) return 3 + (steps.filter(s => s.title === 'observe_page' || s.title === 'run_script').length > 1 ? 1 : 0);
  if (ok('request_credentials')) return 2;
  if (ok('declare_login')) return 1;
  return steps.length > 0 ? 0 : -1;
}

function phaseBeads(reached: number, run: Run): RailBead[] {
  const failed = run.status === 'failed';
  const waiting = run.status === 'awaiting_credentials';
  return PHASES.map((p, i) => {
    const state: BeadState = i < reached ? 'completed' : i === Math.max(reached, 0) ? (failed ? 'failed' : waiting ? 'recovering' : 'running') : 'idle';
    return { id: p.label, label: p.label, glyph: 'tool', icon: { name: p.icon, color: p.color }, state, title: `${p.label}: ${state === 'completed' ? 'done' : state === 'idle' ? 'not reached' : state === 'failed' ? 'did not finish' : 'in progress'}` };
  });
}

const STEP_LABEL: Record<string, string> = {
  observe_page: 'Looked at a page',
  run_script: 'Checked the page',
  declare_login: 'Described the login form',
  request_credentials: 'Asked for your details',
  attempt_login: 'Signed in',
  save_profile: 'Saved the site profile',
  finish: 'Finished',
};

const STEP_ICON: Record<string, IconName> = {
  observe_page: 'scan-search', run_script: 'terminal', declare_login: 'file-search', request_credentials: 'key-round', attempt_login: 'log-in', save_profile: 'book-open',
};

function stepLabel(s: Step): string {
  const base = STEP_LABEL[s.title] ?? s.title;
  if (s.title === 'observe_page' && s.input_excerpt) {
    try { const u = JSON.parse(s.input_excerpt)?.url; if (typeof u === 'string') return `${base}: ${u.replace(/^https?:\/\/(www\.)?/, '')}`; } catch { /* excerpt may be cut */ }
  }
  return base;
}

function runTitle(run: Run): string {
  if (run.kind === 'test') return 'Login test';
  if (run.kind === 'condense') return 'Condense';
  if (run.kind === 'research') return 'Search for tools';
  if (run.kind === 'build') return 'Building tools';
  if (run.kind === 'study') return run.trigger === 'auto' ? 'Automatic study of new tasks' : 'Study of past activity';
  return 'Setup';
}

function runState(run: Run, live: boolean): string {
  if (run.status === 'queued') {
    const at = run.next_attempt_at ? new Date(run.next_attempt_at) : null;
    return run.attempts > 0 && at && at.getTime() > Date.now() ? `trying again at ${at.toLocaleTimeString()}` : 'waiting to start';
  }
  if (live) return run.status === 'awaiting_credentials' ? 'waiting for your details' : 'in progress…';
  return run.status === 'done' ? 'finished' : 'did not finish';
}

const FINISH_TITLES = ['Setup finished', 'Setup did not finish', 'Study finished', 'Study did not finish', 'Study did not start', 'Search finished', 'Search did not finish', 'Search did not start', 'Build finished', 'Build did not start', 'finish'];

export function Activity({ accessId, refreshKey }: { accessId: string; refreshKey: number }) {
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data: runs } = await supabase.from('browser_access_runs')
        .select('id, kind, status, error, started_at, trigger, attempts, next_attempt_at').eq('access_id', accessId).order('started_at', { ascending: false }).limit(1);
      const latest = (runs?.[0] as Run | undefined) ?? null;
      setRun(latest);
      if (latest) {
        const { data } = await supabase.from('browser_access_steps')
          .select('id, step_number, title, status, input_excerpt, output_excerpt, error').eq('run_id', latest.id).order('step_number', { ascending: true });
        setSteps((data as Step[]) ?? []);
      } else {
        setSteps([]);
      }
      setLoaded(true);
    };
    load();
    const channel = supabase.channel(`browser-access-run-${accessId}-${refreshKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_access_steps' }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_access_runs', filter: `access_id=eq.${accessId}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accessId, refreshKey]);

  if (!loaded) return <p style={{ fontSize: '0.76rem', color: C.muted, margin: 0 }}>Loading…</p>;
  if (!run) return <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0 }}>Nothing has run yet. Press <strong>Start setup</strong> to begin.</p>;

  const live = run.status === 'running' || run.status === 'awaiting_credentials' || run.status === 'queued';
  const visible = steps.filter(s => !FINISH_TITLES.includes(s.title));
  const shown = showAll || visible.length <= 6 ? visible : visible.slice(-6);
  const finishing = steps.find(s => FINISH_TITLES.includes(s.title) && s.title !== 'finish');
  const failed = run.status === 'failed';
  const showRail = run.kind === 'onboard' && (live || failed);

  return (
    <div style={{ display: 'grid', gap: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: C.ink }}>{runTitle(run)}</span>
        <Chip tone={failed ? 'red' : live ? 'brass' : 'green'} dot>{runState(run, live)}</Chip>
        <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted }}>{new Date(run.started_at).toLocaleString()}</span>
      </div>
      {run.error && run.error !== 'cancelled' && <p style={{ fontSize: '0.76rem', color: C.red, margin: 0, lineHeight: 1.5 }}>{run.error}</p>}

      {showRail && <ChainRail beads={phaseBeads(phaseReached(steps, run), run)} ariaLabel="Setup progress" />}

      {!live && (finishing?.output_excerpt || ((run.kind === 'study' || run.kind === 'condense' || run.kind === 'research' || run.kind === 'build') && finishing?.error)) && (
        <p style={{ fontSize: '0.78rem', color: finishing?.output_excerpt ? C.ink : C.red, margin: 0, lineHeight: 1.55 }}>{finishing?.output_excerpt || finishing?.error}</p>
      )}

      {visible.length > 0 && (
        <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, overflow: 'hidden' }}>
          {visible.length > 6 && (
            <button type="button" onClick={() => setShowAll(v => !v)} className="ba-btn ba-ghost" style={{ width: '100%', borderRadius: 0, borderBottom: `1px solid ${C.lineSoft}` }}>
              {showAll ? 'Show only the latest' : `Show all ${visible.length} steps`}
            </button>
          )}
          {shown.map(s => {
            const bad = s.status === 'failed';
            return (
              <div key={s.id} className="ba-row" style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', padding: '0.35rem 0.7rem', borderTop: `1px solid ${C.lineSoft}`, fontSize: '0.74rem' }}>
                <span style={{ fontFamily: MONO, color: '#C7C4B4', minWidth: 16, fontSize: '0.66rem' }}>{s.step_number}</span>
                <span style={{ color: bad ? C.red : C.soft, display: 'inline-flex' }}><Icon name={bad ? 'triangle-alert' : STEP_ICON[s.title] ?? 'circle-check'} size={12} /></span>
                <span style={{ color: bad ? C.red : C.ink }}>{stepLabel(s)}</span>
                {s.error && <span style={{ color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{s.error.slice(0, 140)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
