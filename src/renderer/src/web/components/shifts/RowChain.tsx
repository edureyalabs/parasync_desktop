// components/shifts/RowChain.tsx
'use client';

import { useState } from 'react';
import { ChainRail } from '@/components/runsheet/ChainRail';
import { RunsheetStyles } from '@/components/runsheet/RunsheetStyles';
import { agentKindLabel, agentRail, workRail } from './chainModel';
import { BRASS, BRASS_SOFT, GREEN, GREEN_BG, INK, LINE, MONO, MUTED, RED, RED_BG, RED_LINE, SANS, SOFT } from './tokens';
import type { AgentStep, ShiftCron, ShiftNode, ShiftRow, ShiftStep, ShiftTick } from './types';

// One wake, drawn as a horizontal chain: what woke the agent -> its decision -> the steps it ran ->
// how it ended (waits for the next scheduled wake / set a cron / submitted the report). Click
// "Details" for the real outputs and errors of each step.

const STATUS_STYLE: Record<string, { fg: string; bg: string; line: string }> = {
  completed: { fg: GREEN, bg: GREEN_BG, line: '#C5D4B4' },
  done: { fg: GREEN, bg: GREEN_BG, line: '#C5D4B4' },
  failed: { fg: RED, bg: RED_BG, line: RED_LINE },
  running: { fg: BRASS, bg: BRASS_SOFT, line: '#E4D2A0' },
  skipped: { fg: MUTED, bg: '#F0EEE5', line: LINE },
  scheduled: { fg: SOFT, bg: '#F0EEE5', line: LINE },
};

const KIND_LABEL = { scheduled: 'Backup nudge', self_wake: 'Its own wake', cron_wake: 'Woken by the cron', failure_wake: 'Woken by a failed step', learning_wake: 'Learning wake' } as const;
const TICK_COLOR: Record<ShiftTick['status'], string> = { ok: '#B9C9A5', woke: BRASS, failed: RED, skipped: '#D9D5C6' };

function Chip({ children, tone, title }: { children: React.ReactNode; tone: keyof typeof STATUS_STYLE; title?: string }) {
  const c = STATUS_STYLE[tone] ?? STATUS_STYLE.scheduled;
  return (
    <span title={title} style={{ fontFamily: MONO, fontSize: '0.66rem', color: c.fg, background: c.bg, border: `1px solid ${c.line}`, borderRadius: 3, padding: '0.18rem 0.5rem', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}


function stepLabel(step: ShiftStep, nodes: ShiftNode[]): string {
  const node = nodes.find(n => n.id === step.node_id);
  const key = (node?.config.output_key as string | undefined) ?? `step ${step.step_number}`;
  const tool = node?.config.tool_name as string | undefined;
  return tool ? `${key} · ${tool}` : `${key} · ${step.node_type}`;
}

function terminatorLabel(row: ShiftRow, cron: ShiftCron | undefined): { text: string; tone: keyof typeof STATUS_STYLE } | null {
  if (row.terminator === 'yield') return { text: 'Waits for the next scheduled wake', tone: 'scheduled' };
  if (row.terminator === 'report') return { text: 'Submitted the report', tone: 'done' };
  if (row.terminator === 'cron') {
    const spec = row.decision?.cron;
    const base = spec ? `Cron every ${spec.every_minutes} min` : 'Cron';
    if (row.decision?.cron_not_registered) return { text: `${base} not set: ${row.decision.cron_not_registered}`, tone: 'skipped' };
    return { text: cron ? `${base} · ${cron.runs_done}/${cron.max_runs} checks` : base, tone: 'running' };
  }
  return null;
}

const pre: React.CSSProperties = { margin: '0.25rem 0 0', fontFamily: MONO, fontSize: '0.72rem', background: '#F7F6F2', border: `1px solid ${LINE}`, borderRadius: 4, padding: '0.5rem 0.65rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' };
const laneTag: React.CSSProperties = { margin: '0.7rem 0 0.1rem', fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: MUTED };

function argsText(a: Record<string, unknown> | null): string {
  if (!a || Object.keys(a).length === 0) return '';
  try { return JSON.stringify(a, null, 2); } catch { return String(a); }
}

export default function RowChain({ row, steps, agentSteps, nodes, cron, ticks, timezone }: {
  row: ShiftRow;
  steps: ShiftStep[];
  agentSteps: AgentStep[];
  nodes: ShiftNode[];
  cron: ShiftCron | undefined;
  ticks: ShiftTick[];
  timezone: string;
}) {
  const [open, setOpen] = useState(row.status === 'running' || row.status === 'failed');
  const [picked, setPicked] = useState<string | null>(null);
  const ownSteps = steps.filter(s => s.row_id === row.id).sort((a, b) => a.step_number - b.step_number);
  const ownAgent = agentSteps.filter(s => s.row_id === row.id).sort((a, b) => a.step_number - b.step_number || a.created_at.localeCompare(b.created_at));
  const context = ownAgent.find(s => s.kind === 'context');
  const decisions = ownAgent.filter(s => s.kind !== 'context');
  const agent = agentRail(decisions);
  const work = workRail(ownSteps, nodes);
  const term = terminatorLabel(row, cron);
  const reason = row.wake_reason?.reason || row.wake_reason?.note;
  const when = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(row.scheduled_for));
  const upcoming = row.status === 'scheduled';
  const pickedAgent = decisions.find(s => s.id === picked);
  const pickedWork = ownSteps.find(s => s.id === picked);

  return (
    <div style={{ border: `1px solid ${row.status === 'failed' ? RED_LINE : LINE}`, background: upcoming ? 'transparent' : '#fff', borderRadius: 6, padding: '0.8rem 0.95rem', opacity: row.status === 'skipped' ? 0.65 : 1 }}>
      <RunsheetStyles />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: INK }}>{row.label || `Wake ${when}`}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: MUTED }}>{KIND_LABEL[row.kind]} · {when}</span>
        <Chip tone={row.status === 'done' ? 'done' : row.status}>{row.status === 'running' ? 'Working…' : row.status}</Chip>
        {term && <Chip tone={term.tone}>{term.text}</Chip>}
        {!upcoming && (
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: SOFT, fontFamily: SANS, fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            {open ? 'Hide' : 'Show what the agent did'}
          </button>
        )}
      </div>

      {reason && <p style={{ margin: '0.45rem 0 0', fontSize: '0.78rem', color: SOFT, lineHeight: 1.5 }}>{upcoming ? 'This wake is for: ' : 'Woken because: '}{reason}</p>}
      {row.decision?.why && <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: INK, lineHeight: 1.55 }}><span style={{ color: MUTED }}>Decided: </span>{row.decision.why}</p>}

      {open && !upcoming && (
        <>
          <p style={laneTag}>Planning phase · the agent looks things up and builds the chain ({row.iterations_used} step{row.iterations_used === 1 ? '' : 's'})</p>
          {decisions.length > 0
            ? <ChainRail beads={agent.beads} selectedId={picked} onSelect={id => setPicked(c => (c === id ? null : id))} follow={row.status === 'running' ? agent.follow : null} ariaLabel={`${row.label}: the agent’s decisions`} />
            : <p style={{ margin: '0.2rem 0 0', fontSize: '0.74rem', color: MUTED }}>{row.status === 'running' ? 'Starting…' : 'No step-by-step record was kept for this wake.'}</p>}

          {ownSteps.length > 0 && (
            <>
              <p style={laneTag}>Execution phase · the chain runs, no agent involved</p>
              <ChainRail beads={work.beads} selectedId={picked} onSelect={id => setPicked(c => (c === id ? null : id))} follow={work.follow} ariaLabel={`${row.label}: the work chain`} />
            </>
          )}

          {pickedAgent && (
            <div style={{ marginTop: '0.6rem', borderLeft: `3px solid ${BRASS}`, paddingLeft: '0.7rem' }}>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: '0.72rem', color: pickedAgent.ok ? INK : RED }}>{agentKindLabel(pickedAgent.kind)}{pickedAgent.tool ? ` · ${pickedAgent.tool}` : ''}{pickedAgent.counted ? '' : ' · not counted'}{pickedAgent.ok ? '' : ' · did not work'}</p>
              {argsText(pickedAgent.arguments) && <pre style={{ ...pre, color: SOFT }}>{argsText(pickedAgent.arguments)}</pre>}
              {pickedAgent.result && <pre style={{ ...pre, color: pickedAgent.ok ? INK : RED }}>{pickedAgent.result}</pre>}
            </div>
          )}
          {pickedWork && (
            <div style={{ marginTop: '0.6rem', borderLeft: `3px solid ${BRASS}`, paddingLeft: '0.7rem' }}>
              <p style={{ margin: 0, fontFamily: MONO, fontSize: '0.72rem', color: SOFT }}>{stepLabel(pickedWork, nodes)} · {pickedWork.status}</p>
              {(pickedWork.output_excerpt || pickedWork.error) && <pre style={{ ...pre, color: pickedWork.error ? RED : INK }}>{pickedWork.error ?? pickedWork.output_excerpt}</pre>}
            </div>
          )}

          {context?.result && (
            <details style={{ marginTop: '0.7rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.74rem', color: SOFT }}>What the agent was told at the start of this wake</summary>
              <pre style={{ ...pre, maxHeight: 320, color: SOFT }}>{context.result}</pre>
            </details>
          )}
        </>
      )}

      {cron && ticks.length > 0 && (
        <div style={{ marginTop: '0.65rem' }}>
          <div role="img" aria-label={`${ticks.length} cron checks`} style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {ticks.map(t => <span key={t.id} title={`Check ${t.tick_no}: ${t.status}${t.reason ? ` — ${t.reason}` : ''}${t.error ? ` — ${t.error}` : ''}`} style={{ width: 10, height: 10, borderRadius: 2, background: TICK_COLOR[t.status] }} />)}
          </div>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: MUTED }}>
            {{ woke: 'The cron woke the agent', exhausted: 'The cron ran out of checks', failed: 'The cron’s check kept failing', expired: 'The cron ended at the next scheduled wake', cancelled: 'The cron was replaced', active: 'The cron is running' }[cron.status]}
            {ticks.find(t => t.status === 'woke')?.reason ? `: ${ticks.find(t => t.status === 'woke')?.reason}` : ''}
          </p>
        </div>
      )}

      {row.error && row.status === 'skipped' && <p style={{ margin: '0.45rem 0 0', fontSize: '0.74rem', color: MUTED, lineHeight: 1.5 }}>{row.error}</p>}
      {row.error && row.status === 'failed' && (
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: RED, background: RED_BG, border: `1px solid ${RED_LINE}`, borderRadius: 4, padding: '0.45rem 0.65rem', lineHeight: 1.5 }}>{row.error}</p>
      )}
    </div>
  );
}
