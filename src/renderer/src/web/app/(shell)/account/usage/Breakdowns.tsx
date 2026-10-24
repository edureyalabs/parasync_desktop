// app/(shell)/account/usage/Breakdowns.tsx
'use client';

import { Card, CardTitle } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtCompact, fmtUsd } from '@/components/account/format';
import { downsample, type Slice } from './model';

// Two small pieces that sit under the main chart: a ranked bar list for "where did it come
// from" (source), and the agent comparison table. Bars grow from a single baseline
// with a rounded data end; every value is also printed, so nothing depends on hover.

// ─── Ranked bars ────────────────────────────────────────────────────────────

export function BarList({ title, subtitle, slices, color, empty }: {
  title: string;
  subtitle?: string;
  slices: Slice[];
  color: (slice: Slice) => string;
  empty: string;
}) {
  const max = Math.max(0, ...slices.map(s => s.cost));
  return (
    <Card>
      <CardTitle aside={subtitle && <span style={{ fontSize: '0.7rem', color: C.muted }}>{subtitle}</span>}>{title}</CardTitle>
      {slices.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: C.muted, margin: 0 }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          {slices.map(s => (
            <li key={s.key} title={`${s.label}: ${fmtUsd(s.cost)} · ${s.calls.toLocaleString()} calls · ${fmtCompact(s.promptTokens)} in / ${fmtCompact(s.completionTokens)} out tokens`}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.label}</span>
                <span style={{ fontFamily: MONO, fontSize: '0.78rem', fontWeight: 500, color: C.ink, flexShrink: 0 }}>{fmtUsd(s.cost)}</span>
              </div>
              <div style={{ height: 8, background: '#F3F1E8', borderRadius: 4 }}>
                <div style={{ width: `${max > 0 ? Math.max(1.5, (s.cost / max) * 100) : 0}%`, height: '100%', background: color(s), borderRadius: '0 4px 4px 0' }} />
              </div>
              <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, margin: '0.35rem 0 0' }}>
                {Math.round(s.share * 100)}% · {s.calls.toLocaleString()} call{s.calls === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Agent comparison ───────────────────────────────────────────────────────

export interface AgentRowData {
  id: string;
  name: string;
  color: string;
  slice: Slice;
  /** Cost per bucket, for the trend. */
  trend: number[];
  /** Spend over the previous equally long period; null when that period is not in the data. */
  previous: number | null;
}

function Trend({ values, color }: { values: number[]; color: string }) {
  const bars = downsample(values, 14);
  const max = Math.max(0, ...bars);
  return (
    <svg width={14 * 5 - 2} height={26} aria-hidden="true" style={{ display: 'block' }}>
      {bars.map((v, i) => {
        const h = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * 24) : 0;
        return <rect key={i} x={i * 5} y={26 - h} width={3} height={h} rx={1} fill={color} />;
      })}
    </svg>
  );
}

function Change({ now, previous }: { now: number; previous: number | null }) {
  if (previous === null) return <span style={{ color: C.faint }}>{'—'}</span>;
  if (previous <= 0) return now > 0 ? <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: C.slate }}>new</span> : <span style={{ color: C.faint }}>{'—'}</span>;
  const pct = (now - previous) / previous;
  if (Math.abs(pct) < 0.005) return <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: C.soft }}>flat</span>;
  const up = pct > 0;
  // More spend is the thing to notice, so up is amber and down is green; the sign and arrow carry it too.
  return (
    <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: up ? C.amber : C.green, whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(pct * 100)).toLocaleString()}%
    </span>
  );
}

const GRID = 'minmax(170px, 1.7fr) minmax(90px, 0.8fr) minmax(130px, 1.1fr) minmax(70px, 0.6fr) minmax(90px, 0.7fr) 76px minmax(78px, 0.6fr)';

export function AgentTable({ rows, previousLabel }: { rows: AgentRowData[]; previousLabel: string }) {
  const headStyle = (right = false): React.CSSProperties => ({ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', textAlign: right ? 'right' : 'left' });
  return (
    <Card pad="0" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '1.1rem 1.4rem 0.9rem' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 500, color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>Agents compared</h2>
        <span style={{ fontSize: '0.7rem', color: C.muted }}>Sorted by spend in this period</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 780 }} role="table" aria-label="Spend by agent">
          <div role="row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 1rem', padding: '0.55rem 1.4rem', background: C.surface, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
            <span role="columnheader" style={headStyle()}>Agent</span>
            <span role="columnheader" style={headStyle(true)}>Spend</span>
            <span role="columnheader" style={headStyle()}>Share</span>
            <span role="columnheader" style={headStyle(true)}>Calls</span>
            <span role="columnheader" style={headStyle(true)}>Per call</span>
            <span role="columnheader" style={headStyle()}>Trend</span>
            <span role="columnheader" style={headStyle(true)} title={previousLabel}>vs previous</span>
          </div>
          {rows.length === 0 && <p style={{ margin: 0, padding: '1.5rem 1.4rem', fontSize: '0.8rem', color: C.muted }}>No agent spend in this period.</p>}
          {rows.map(r => (
            <div key={r.id} role="row" className="ac-row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 1rem', alignItems: 'center', padding: '0.8rem 1.4rem', borderBottom: `1px solid ${C.lineSoft}` }}>
              <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                  <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, margin: '2px 0 0' }}>{fmtCompact(r.slice.promptTokens)} in {'·'} {fmtCompact(r.slice.completionTokens)} out tokens</p>
                </div>
              </div>
              <span role="cell" style={{ textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.84rem', fontWeight: 500, color: C.ink }}>{fmtUsd(r.slice.cost)}</span>
              <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <div style={{ flex: 1, height: 6, background: '#F3F1E8', borderRadius: 3 }}>
                  <div style={{ width: `${Math.max(1.5, r.slice.share * 100)}%`, height: '100%', background: r.color, borderRadius: '0 3px 3px 0' }} />
                </div>
                <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', color: C.soft, width: 32, textAlign: 'right' }}>{Math.round(r.slice.share * 100)}%</span>
              </div>
              <span role="cell" style={{ textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem', color: C.body }}>{r.slice.calls.toLocaleString()}</span>
              <span role="cell" style={{ textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.76rem', color: C.soft }}>{r.slice.calls > 0 ? fmtUsd(r.slice.cost / r.slice.calls) : '—'}</span>
              <div role="cell"><Trend values={r.trend} color={r.color} /></div>
              <div role="cell" style={{ textAlign: 'right' }}><Change now={r.slice.cost} previous={r.previous} /></div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
