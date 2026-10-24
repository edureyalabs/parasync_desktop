// components/runsheet/NodeDetail.tsx
'use client';

// What one chain step looked like: what it is, how it ended, and its input, result and error.
// Opens under the rail when a bead is clicked -- only that one step is expanded.
import { CodeBlock } from './CodeBlock';
import { nodeGlyph, nodeLabel, nodeSummary, nodeTypeTag, prettyJson, formatDuration } from './chainModel';
import { RunsheetStyles } from './RunsheetStyles';
import { ACCENT, LINE, MUTED, PAPER, SOFT, STATE_STYLE, stateChip, type BeadState } from './tokens';
import type { ChainNode, StepGroup } from './types';

function plannedConfig(node: ChainNode): string {
  const rest: Record<string, unknown> = { ...node.config };
  delete rest.output_key;
  return JSON.stringify(rest, null, 2);
}

export function NodeDetail({ node, group, state }: { node: ChainNode; group: StepGroup | undefined; state: BeadState }) {
  const accent = ACCENT[nodeGlyph(node)];
  const chip = stateChip(state);
  const latest = group?.latest;
  const duration = latest ? formatDuration(latest.started_at, latest.ended_at) : null;
  const failedEarlier = (group?.earlier ?? []).filter(s => s.status === 'failed' && s.error);

  return (
    <div style={{ marginTop: '0.6rem', background: PAPER, border: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: '0.7rem 0.85rem 0.8rem', animation: 'rsSlide .18s ease-out' }}>
      <RunsheetStyles />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: accent }}>
          {nodeTypeTag(node)}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.78rem', color: '#26251E' }}>
          {node.step_number}. {nodeLabel(node)}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: 3, color: chip.fg, background: chip.bg, border: `1px ${STATE_STYLE[state].dashed ? 'dashed' : 'solid'} ${chip.border}` }}>
          {STATE_STYLE[state].label}
        </span>
        {duration && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: MUTED }}>{duration}</span>}
        {group && group.attempts > 1 && (
          <span style={{ fontSize: '0.68rem', color: '#B5651D' }}>
            {state === 'completed'
              ? `Fixed automatically after ${group.attempts - 1} failed attempt${group.attempts - 1 === 1 ? '' : 's'}`
              : `${group.attempts - 1} earlier failed attempt${group.attempts - 1 === 1 ? '' : 's'}`}
          </span>
        )}
      </div>

      {nodeSummary(node) && <p style={{ fontSize: '0.8rem', color: SOFT, margin: '0.4rem 0 0', lineHeight: 1.5 }}>{nodeSummary(node)}</p>}

      {latest?.input_excerpt
        ? <CodeBlock label="Input" text={prettyJson(latest.input_excerpt)} />
        : <CodeBlock label={latest ? 'Input' : 'Planned input'} text={plannedConfig(node)} />}
      {latest?.status === 'completed' && latest.output_excerpt && <CodeBlock label="Result" text={prettyJson(latest.output_excerpt)} />}
      {latest?.status === 'failed' && latest.error && <CodeBlock label="Error" text={latest.error} tone="error" />}
      {latest?.status === 'running' && <p style={{ fontSize: '0.74rem', color: '#A17F3A', margin: '0.55rem 0 0' }}>Running now…</p>}
      {!latest && state !== 'idle' && state !== 'building' && (
        <p style={{ fontSize: '0.74rem', color: MUTED, margin: '0.55rem 0 0' }}>{state === 'skipped' ? 'The run ended before reaching this step.' : 'Waiting for the steps before it.'}</p>
      )}

      {failedEarlier.length > 0 && (
        <details style={{ marginTop: '0.6rem' }}>
          <summary style={{ cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', color: '#B5651D', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Earlier failed attempt{failedEarlier.length === 1 ? '' : 's'} ({failedEarlier.length})
          </summary>
          {failedEarlier.map(s => <CodeBlock key={s.id} label={`Attempt at ${new Date(s.started_at).toLocaleTimeString()}`} text={s.error ?? ''} tone="error" maxHeight={140} />)}
        </details>
      )}
    </div>
  );
}
