// app/(shell)/account/usage/CostChart.tsx
'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { C, MONO } from '@/components/account/tokens';
import { fmtTick, fmtUsd } from '@/components/account/format';
import { bucketTotals, cumulative, type Bucket, type Series } from './model';
import { CHART, seriesColor, TOTAL_COLOR } from './palette';

// Cost over time, three ways, one axis:
//   bars        spend per bucket, stacked by agent (what each period cost, and who it was)
//   lines       one line per agent (compare agents on the same scale)
//   cumulative  the running total, with each agent's contribution
// Hand-drawn SVG: thin marks, hairline recessive grid, a 2px surface gap between stacked
// segments, a ringed end-dot on lines, a crosshair + one tooltip listing every series at the
// pointed-at period, keyboard navigation, a legend that shows each series' total, and a table
// twin of the same numbers. Colour comes from palette.ts and follows the agent, never its rank.

export type ChartMode = 'bars' | 'lines' | 'cumulative';
export type ChartView = 'chart' | 'table';

const HEIGHT = 312;
const MARGIN = { top: 14, right: 16, bottom: 30, left: 58 };
const GAP = 2;          // surface-coloured gap between touching marks
const MAX_BAR = 24;     // a bar is never fatter than this: leftover width is air
const RADIUS = 4;       // rounded data end

interface Drawn {
  key: string;
  label: string;
  color: string;
  values: number[];
  /** Period total, shown in the legend. */
  total: number;
  isTotal?: boolean;
}

function niceScale(max: number, target = 4): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  return { max: Math.ceil(max / step - 1e-9) * step, step };
}

/** Path for a column with a rounded top and a square base. */
function roundedTop(x: number, w: number, yTop: number, yBottom: number): string {
  const r = Math.max(0, Math.min(RADIUS, (yBottom - yTop) / 2, w / 2));
  return `M${x},${yBottom}L${x},${yTop + r}Q${x},${yTop} ${x + r},${yTop}L${x + w - r},${yTop}Q${x + w},${yTop} ${x + w},${yTop + r}L${x + w},${yBottom}Z`;
}

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

// ─── Legend ─────────────────────────────────────────────────────────────────

function Legend({ drawn, mode, highlight, onHighlight }: {
  drawn: Drawn[]; mode: ChartMode; highlight: string | null; onHighlight: (key: string | null) => void;
}) {
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem 1.4rem', listStyle: 'none', margin: '0 0 0.85rem', padding: 0 }}>
      {drawn.map(d => (
        <li
          key={d.key} onMouseEnter={() => onHighlight(d.key)} onMouseLeave={() => onHighlight(null)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: highlight && highlight !== d.key ? 0.4 : 1, transition: 'opacity 0.12s', minWidth: 0 }}
        >
          {mode === 'bars' && !d.isTotal
            ? <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
            : <span style={{ width: 16, height: 0, borderTop: `${d.isTotal ? 3 : 2}px solid ${d.color}`, borderRadius: 2, flexShrink: 0 }} />}
          <span style={{ fontSize: '0.78rem', color: C.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{d.label}</span>
          <span style={{ fontFamily: MONO, fontSize: '0.7rem', color: C.soft }}>{fmtUsd(d.total)}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Table twin ─────────────────────────────────────────────────────────────

function DataTable({ buckets, series }: { buckets: Bucket[]; series: Series[] }) {
  const totals = bucketTotals(series, buckets.length);
  const grand = totals.reduce((a, b) => a + b, 0);
  const cell: React.CSSProperties = { padding: '0.45rem 0.8rem', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.74rem', color: C.body, whiteSpace: 'nowrap' };
  return (
    <div style={{ maxHeight: 372, overflow: 'auto', border: `1px solid ${C.line}`, borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...cell, textAlign: 'left', position: 'sticky', top: 0, left: 0, background: C.surface, zIndex: 2, color: C.muted, fontWeight: 500, fontSize: '0.62rem', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Period</th>
            <th scope="col" style={{ ...cell, position: 'sticky', top: 0, background: C.surface, zIndex: 1, color: C.ink, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>Total</th>
            {series.map(s => (
              <th key={s.key} scope="col" style={{ ...cell, position: 'sticky', top: 0, background: C.surface, zIndex: 1, color: C.soft, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: seriesColor(s.slot) }} />{s.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => (
            <tr key={b.key} className="ac-row" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
              <th scope="row" style={{ ...cell, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', fontWeight: 400, fontFamily: "'Inter', sans-serif", color: C.ink }}>{b.label}</th>
              <td style={{ ...cell, color: C.ink, fontWeight: 500 }}>{totals[i] > 0 ? fmtUsd(totals[i]) : '\u2014'}</td>
              {series.map(s => <td key={s.key} style={{ ...cell, color: s.values[i] > 0 ? C.body : C.faint }}>{s.values[i] > 0 ? fmtUsd(s.values[i]) : '\u2014'}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1px solid ${C.line}` }}>
            <th scope="row" style={{ ...cell, textAlign: 'left', position: 'sticky', left: 0, bottom: 0, background: C.surface, fontFamily: "'Inter', sans-serif", fontWeight: 500, color: C.ink }}>Total</th>
            <td style={{ ...cell, position: 'sticky', bottom: 0, background: C.surface, fontWeight: 600, color: C.ink }}>{fmtUsd(grand)}</td>
            {series.map(s => <td key={s.key} style={{ ...cell, position: 'sticky', bottom: 0, background: C.surface, fontWeight: 500, color: C.ink }}>{fmtUsd(s.total)}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── The chart ──────────────────────────────────────────────────────────────

export function CostChart({ buckets, series, mode, view, dimmed }: {
  buckets: Bucket[]; series: Series[]; mode: ChartMode; view: ChartView; dimmed: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const n = buckets.length;
  const totals = useMemo(() => bucketTotals(series, n), [series, n]);
  const grandTotal = totals.reduce((a, b) => a + b, 0);
  const hasData = grandTotal > 0;

  // The measured element only exists in the chart view with data, so (re)attach whenever that changes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [view, hasData]);

  // What gets drawn, per mode.
  const drawn = useMemo<Drawn[]>(() => {
    const base: Drawn[] = series.map(s => ({
      key: s.key, label: s.label, color: seriesColor(s.slot), total: s.total,
      values: mode === 'cumulative' ? cumulative(s.values) : s.values,
    }));
    if (mode === 'cumulative') {
      base.push({ key: '__total', label: 'Total', color: TOTAL_COLOR, total: grandTotal, values: cumulative(totals), isTotal: true });
    }
    return base;
  }, [series, mode, totals, grandTotal]);

  const plotW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotH;
  const slot = plotW / Math.max(1, n);

  const yMaxData = useMemo(() => {
    if (mode === 'bars') return Math.max(0, ...totals);
    return Math.max(0, ...drawn.flatMap(d => d.values));
  }, [mode, totals, drawn]);
  const scale = useMemo(() => niceScale(yMaxData), [yMaxData]);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let v = 0; v <= scale.max + scale.step / 2; v += scale.step) out.push(v);
    return out;
  }, [scale]);

  const y = (v: number) => baseline - (v / scale.max) * plotH;
  const cx = (i: number) => MARGIN.left + slot * (i + 0.5);

  // Space axis labels by how wide they really are ("Oct" needs far less room than "Sep 28").
  const longestLabel = buckets.reduce((len, b) => Math.max(len, b.short.length), 3);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / (longestLabel * 6.6 + 18)))));
  const barW = Math.max(2, Math.min(MAX_BAR, slot - Math.max(2, slot * 0.28)));
  // Label the final period too, unless it would crowd the last regular label.
  const lastRegular = Math.floor((n - 1) / labelEvery) * labelEvery;
  const lastLabelIndex = n - 1 - lastRegular >= Math.ceil(labelEvery * 0.6) ? n - 1 : -1;

  const locate = (clientX: number) => {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg || n === 0) return;
    const x = clientX - svg.getBoundingClientRect().left - MARGIN.left;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(x / slot))));
  };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const last = n - 1;
    const move = (to: number) => { e.preventDefault(); setHover(Math.max(0, Math.min(last, to))); };
    if (e.key === 'ArrowRight') move((hover ?? -1) + 1);
    else if (e.key === 'ArrowLeft') move((hover ?? 1) - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(last);
    else if (e.key === 'Escape') setHover(null);
  };

  const legend = <Legend drawn={drawn} mode={mode} highlight={highlight} onHighlight={setHighlight} />;

  if (view === 'table') {
    return <div style={{ opacity: dimmed ? 0.55 : 1, transition: 'opacity 0.2s' }}>{legend}<DataTable buckets={buckets} series={series} /></div>;
  }

  if (!hasData) {
    return (
      <div style={{ height: HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.35rem', border: `1px dashed ${C.line}`, borderRadius: 8, background: C.paper }}>
        <p style={{ fontSize: '0.9rem', fontWeight: 500, color: C.ink, margin: 0 }}>No spend in this period</p>
        <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0 }}>Try a longer period, or clear the agent and source filters.</p>
      </div>
    );
  }

  // Tooltip rows for the hovered bucket: values lead, names follow, biggest first.
  const hovered = hover !== null && hover < n ? hover : null;
  const tipRows = hovered === null ? [] : drawn
    .filter(d => !d.isTotal)
    .map(d => ({ key: d.key, label: d.label, color: d.color, value: d.values[hovered] }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const tipTotal = hovered === null ? 0 : mode === 'cumulative' ? cumulative(totals)[hovered] : totals[hovered];
  const flip = hovered !== null && cx(hovered) > width * 0.58;

  const summary = `${mode === 'bars' ? 'Stacked bars' : mode === 'lines' ? 'Lines' : 'Cumulative lines'} of cost per ${buckets.length > 1 ? 'period' : 'day'}, ${buckets[0]?.label} to ${buckets[n - 1]?.label}, total ${fmtUsd(grandTotal)}.`;

  return (
    <div style={{ opacity: dimmed ? 0.55 : 1, transition: 'opacity 0.2s' }}>
      {legend}
      <div
        ref={wrapRef} tabIndex={0} role="group" aria-label={`${summary} Use the left and right arrow keys to read each period.`}
        onKeyDown={onKey} onFocus={() => setHover(h => h ?? n - 1)} onBlur={() => setHover(null)}
        style={{ position: 'relative', outline: 'none', borderRadius: 6 }}
        className="cc-wrap"
      >
        <style>{`.cc-wrap:focus-visible { box-shadow: 0 0 0 2px ${C.brass}; }`}</style>
        <svg width={width} height={HEIGHT} aria-hidden="true" style={{ display: 'block', touchAction: 'pan-y' }}>
          {/* Grid: hairline, solid, recessive */}
          {ticks.map(t => (
            <g key={t}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} strokeWidth={1} />
              <text x={MARGIN.left - 10} y={y(t) + 3.5} textAnchor="end" fontFamily="'IBM Plex Mono', monospace" fontSize="10.5" fill={CHART.tick}>{fmtTick(t, scale.step)}</text>
            </g>
          ))}

          {/* The hovered period */}
          {hovered !== null && (mode === 'bars'
            ? <rect x={MARGIN.left + slot * hovered} y={MARGIN.top} width={slot} height={plotH} fill={CHART.hover} />
            : <line x1={cx(hovered)} x2={cx(hovered)} y1={MARGIN.top} y2={baseline} stroke={CHART.axis} strokeWidth={1} />)}

          {/* Marks */}
          {mode === 'bars' ? (
            buckets.map((b, i) => {
              let acc = 0;
              const segs = series.filter(s => s.values[i] > 0).map(s => {
                const bottom = y(acc);
                acc += s.values[i];
                return { s, top: y(acc), bottom };
              });
              return (
                <g key={b.key}>
                  {segs.map((seg, k) => {
                    const isTop = k === segs.length - 1;
                    const bottom = k === 0 ? seg.bottom : seg.bottom - GAP;     // the gap sits between segments, never under the base
                    const top = Math.min(seg.top, bottom - 1.5);                  // a sliver of spend stays visible
                    const x = cx(i) - barW / 2;
                    const dim = highlight !== null && highlight !== seg.s.key;
                    const fill = seriesColor(seg.s.slot);
                    return isTop
                      ? <path key={seg.s.key} d={roundedTop(x, barW, top, bottom)} fill={fill} opacity={dim ? 0.22 : 1} />
                      : <rect key={seg.s.key} x={x} y={top} width={barW} height={Math.max(1.5, bottom - top)} fill={fill} opacity={dim ? 0.22 : 1} />;
                  })}
                </g>
              );
            })
          ) : (
            drawn.map(d => {
              if (!(d.total > 0)) return null;
              const dim = highlight !== null && highlight !== d.key;
              const points = d.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ');
              const lastI = n - 1;
              return (
                <g key={d.key} opacity={dim ? 0.2 : 1}>
                  <polyline points={points} fill="none" stroke={d.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={cx(lastI)} cy={y(d.values[lastI])} r={4} fill={d.color} stroke={CHART.surface} strokeWidth={2} />
                  {hovered !== null && hovered !== lastI && <circle cx={cx(hovered)} cy={y(d.values[hovered])} r={4} fill={d.color} stroke={CHART.surface} strokeWidth={2} />}
                </g>
              );
            })
          )}

          {/* X axis labels */}
          {buckets.map((b, i) => (i % labelEvery === 0 || i === lastLabelIndex)
            ? <text key={b.key} x={cx(i)} y={baseline + 19} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10.5" fill={hovered === i ? C.ink : CHART.tick}>{b.short}</text>
            : null)}

          {/* Hit layer: the whole plot, so the pointer only has to be near a period, never on a 2px mark */}
          <rect
            x={MARGIN.left} y={MARGIN.top} width={plotW} height={plotH} fill="transparent" style={{ cursor: 'crosshair' }}
            onPointerMove={e => locate(e.clientX)} onPointerDown={e => locate(e.clientX)} onPointerLeave={() => setHover(null)}
          />
        </svg>

        {hovered !== null && (
          <div
            role="presentation"
            style={{
              position: 'absolute', top: 6, left: cx(hovered), transform: `translateX(${flip ? 'calc(-100% - 14px)' : '14px'})`,
              pointerEvents: 'none', zIndex: 5, minWidth: 190, maxWidth: 280, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8,
              boxShadow: '0 6px 22px rgba(38,37,30,0.14)', padding: '0.6rem 0.75rem',
            }}
          >
            <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 0.45rem' }}>
              {buckets[hovered].label}{mode === 'cumulative' ? ' · running total' : ''}
            </p>
            {tipRows.length === 0 && <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0 }}>No spend</p>}
            {tipRows.map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.14rem 0' }}>
                <span style={{ width: 12, height: 0, borderTop: `2px solid ${r.color}`, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.74rem', color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                <span style={{ fontFamily: MONO, fontSize: '0.78rem', fontWeight: 500, color: C.ink }}>{fmtUsd(r.value)}</span>
              </div>
            ))}
            {tipRows.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.lineSoft}`, marginTop: '0.4rem', paddingTop: '0.4rem' }}>
                <span style={{ fontSize: '0.74rem', color: C.soft }}>Total</span>
                <span style={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 600, color: C.ink }}>{fmtUsd(tipTotal)}</span>
              </div>
            )}
          </div>
        )}
        <div aria-live="polite" style={srOnly}>
          {hovered !== null ? `${buckets[hovered].label}: ${fmtUsd(tipTotal)} total. ${tipRows.map(r => `${r.label} ${fmtUsd(r.value)}`).join(', ')}` : ''}
        </div>
      </div>
    </div>
  );
}
