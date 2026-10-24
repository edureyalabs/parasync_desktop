// components/runsheet/ChainRail.tsx
'use client';

// The horizontal dot-and-line rail. One component draws every chain in the Runsheet:
// a task's nodes on its card, the same nodes expanded, and a planner pass's own steps.
//
//   * a BEAD per node, a small rounded tile: the picture is the tool (or the node type), the
//     border/fill is its state, a corner badge says ok / failed / repairing / fixed;
//   * a LINE between beads that shows how far the work got: solid green behind finished
//     work, a flowing brass line into the running node, dashes where it stopped or is
//     being repaired;
//   * a GHOST bead at the end while the planner is still adding nodes;
//   * optional SECTIONS: a bead can start a labelled section (a planner pass) so several passes read as one continuous rail.
//
// It is purely presentational: callers pass beads and get clicks back.
import { useEffect, useRef } from 'react';
import { Icon } from '@/components/icons/Icon';
import type { ToolIconSpec } from '@/components/icons/toolIcons';
import { Glyph } from './Glyphs';
import { RunsheetStyles } from './RunsheetStyles';
import { ACCENT, INK, MUTED, SOFT, STATE_STYLE, type BeadState, type GlyphKey, type SegmentKind } from './tokens';

export interface RailBead {
  id: string;
  label: string;
  /** second line under the label, e.g. the node type and how long it took */
  sublabel?: string;
  glyph: GlyphKey;
  /** a specific picture (a tool's own icon) used instead of the glyph; its colour is kept while the node is not running, failed or repairing */
  icon?: ToolIconSpec;
  /** this bead starts a labelled section of the rail (e.g. a planner pass) */
  section?: { label: string; tone: 'plan' | 'repair' | 'neutral' };
  state: BeadState;
  /** set once a step needed repair and then succeeded */
  fixed?: boolean;
  /** hover text and screen-reader label */
  title: string;
}

export interface RailGhost {
  label: string;
  /** 'building' = the planner is adding the next node; 'stopped' = it gave up here */
  tone: 'building' | 'stopped';
}

interface Props {
  beads: RailBead[];
  ghost?: RailGhost | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** the bead to keep in view as the work moves along */
  follow?: string | null;
  ariaLabel: string;
}

// One size everywhere (cards, the expanded Chain tab, the Planner tab) so the rail never changes size.
const DIM = { bead: 20, cell: 68, line: 1.5, glyph: 12, badge: 10, label: '0.58rem', section: 15 };
const BEAD_BORDER = 1.5;
const BEAD_RADIUS = 7;

const SECTION_TONE: Record<'plan' | 'repair' | 'neutral', { fg: string; bg: string; line: string }> = {
  plan: { fg: '#3D5A6E', bg: '#E8EEF2', line: '#BFCCD6' },
  repair: { fg: '#B5651D', bg: '#F9E8D5', line: '#D9A06A' },
  neutral: { fg: '#67655A', bg: '#EDEBE2', line: '#DAD5C5' },
};

function segmentKind(from: RailBead, to: RailBead | 'ghost'): SegmentKind {
  if (to === 'ghost') return 'build';
  if (to.section) return 'break';
  if (from.state === 'failed') return 'dead';
  if (from.state === 'recovering') return 'repair';
  if (from.state === 'completed') return to.state === 'running' ? 'flow' : 'done';
  return 'idle';
}

function segmentBackground(kind: SegmentKind): { background: string; backgroundSize?: string; animation?: string } {
  switch (kind) {
    case 'done': return { background: '#8DBA9A' };
    case 'break': return { background: 'repeating-linear-gradient(90deg, #C9C3AE 0 2px, transparent 2px 6px)' };
    case 'flow': return { background: 'repeating-linear-gradient(90deg, #C9A24D 0 8px, #F0DDA6 8px 14px)', backgroundSize: '28px 100%', animation: 'rsFlow 0.9s linear infinite' };
    case 'dead': return { background: 'repeating-linear-gradient(90deg, #D9A196 0 4px, transparent 4px 8px)' };
    case 'repair': return { background: 'repeating-linear-gradient(90deg, #D9A06A 0 5px, transparent 5px 10px)', backgroundSize: '12px 100%', animation: 'rsDash 0.7s linear infinite' };
    case 'build': return { background: 'repeating-linear-gradient(90deg, #8FA3B2 0 5px, transparent 5px 10px)', backgroundSize: '12px 100%', animation: 'rsDash 0.9s linear infinite' };
    default: return { background: '#DAD5C5' };
  }
}

function HalfLine({ kind, height }: { kind: SegmentKind | null; height: number }) {
  if (kind === null) return <div style={{ flex: 1, height }} />;
  const s = segmentBackground(kind);
  return <div className="rs-anim" style={{ flex: 1, height, borderRadius: height, ...s }} />;
}

function badgeFor(bead: RailBead): { glyph: GlyphKey; bg: string; title: string } | null {
  if (bead.state === 'completed') return bead.fixed ? { glyph: 'wrench', bg: '#B5651D', title: 'Fixed automatically' } : { glyph: 'check', bg: '#3D7A4F', title: 'Completed' };
  if (bead.state === 'failed') return { glyph: 'cross', bg: '#B34A3C', title: 'Failed' };
  if (bead.state === 'recovering') return { glyph: 'wrench', bg: '#B5651D', title: 'Being repaired' };
  return null;
}

function Bead({ bead, selected, onSelect }: { bead: RailBead; selected: boolean; onSelect?: (id: string) => void }) {
  const d = DIM;
  const st = STATE_STYLE[bead.state];
  // A tool keeps its own colour while the node is calm; running / failed / repairing take the state colour so they stand out.
  const loud = bead.state === 'running' || bead.state === 'failed' || bead.state === 'recovering';
  const color = bead.icon && !loud ? bead.icon.color : st.fg ?? ACCENT[bead.glyph];
  const badge = badgeFor(bead);
  const glow = bead.state === 'running' ? 'rsGlow 1.8s ease-in-out infinite' : bead.state === 'recovering' ? 'rsGlowAmber 2.2s ease-in-out infinite' : undefined;
  return (
    <button
      type="button"
      className="rs-bead rs-anim"
      data-bead-id={bead.id}
      aria-label={bead.title}
      aria-pressed={selected}
      title={bead.title}
      onClick={() => onSelect?.(bead.id)}
      style={{
        position: 'relative', flex: 'none', width: d.bead, height: d.bead, padding: 0, borderRadius: BEAD_RADIUS,
        display: 'grid', placeItems: 'center', background: st.bg, color,
        border: `${BEAD_BORDER}px ${st.dashed ? 'dashed' : 'solid'} ${st.ring}`,
        opacity: bead.state === 'skipped' ? 0.6 : 1,
        boxShadow: selected ? `0 0 0 2px ${st.ring}88, 0 3px 8px rgba(38,37,30,.12)` : '0 1px 1px rgba(38,37,30,.04)',
        animation: bead.state === 'building' ? 'rsPop .38s ease-out' : glow,
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      {bead.icon ? <Icon name={bead.icon.name} size={d.glyph} strokeWidth={1.8} /> : <Glyph name={bead.glyph} size={d.glyph} />}
      {badge && (
        <span
          title={badge.title}
          style={{
            position: 'absolute', right: -4, bottom: -4, width: d.badge, height: d.badge, borderRadius: '50%', background: badge.bg,
            color: '#fff', display: 'grid', placeItems: 'center', border: '1.5px solid #fff',
          }}
        >
          <Glyph name={badge.glyph} size={d.badge - 4} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function labelColor(state: BeadState): string {
  if (state === 'running') return INK;
  if (state === 'failed') return '#B34A3C';
  if (state === 'recovering') return '#B5651D';
  if (state === 'completed') return SOFT;
  return MUTED;
}

export function ChainRail({ beads, ghost, selectedId = null, onSelect, follow = null, ariaLabel }: Props) {
  const d = DIM;
  const scroller = useRef<HTMLDivElement | null>(null);

  // Keep the bead that is moving in view -- the rail scrolls itself as the chain grows or the run advances.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = follow ? el.querySelector<HTMLElement>(`[data-bead-id="${CSS.escape(follow)}"]`) : null;
    // No matching bead but something to follow = the ghost at the end of the rail.
    const left = target ? target.offsetLeft + target.offsetWidth / 2 - el.clientWidth / 2 : follow ? el.scrollWidth : 0;
    el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [follow, beads.length, ghost?.tone]);

  const hasSections = beads.some(b => b.section);
  const kinds: SegmentKind[] = beads.map((b, i) => segmentKind(b, i + 1 < beads.length ? beads[i + 1] : 'ghost'));

  return (
    <div
      ref={scroller}
      className="rs-rail"
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex', alignItems: 'flex-start', overflowX: 'auto', padding: '6px 2px 3px',
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%)',
        maskImage: 'linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%)',
      }}
    >
      <RunsheetStyles />
      {beads.map((bead, i) => {
        const prevKind = i === 0 ? null : kinds[i - 1];
        const nextKind = i < beads.length - 1 ? kinds[i] : ghost ? kinds[i] : null;
        return (
          <div key={bead.id} style={{ position: 'relative', flex: 'none', width: d.cell, paddingTop: hasSections ? d.section : 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {bead.section && (
              <span
                style={{
                  position: 'absolute', top: 0, left: `calc(50% - ${d.bead / 2}px)`, zIndex: 1, whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.52rem', letterSpacing: '0.06em',
                  textTransform: 'uppercase', lineHeight: 1, padding: '0.16rem 0.4rem', borderRadius: 999, color: SECTION_TONE[bead.section.tone].fg,
                  background: SECTION_TONE[bead.section.tone].bg, border: `1px solid ${SECTION_TONE[bead.section.tone].line}`,
                }}
              >
                {bead.section.label}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: d.bead }}>
              <HalfLine kind={prevKind} height={d.line} />
              <Bead bead={bead} selected={selectedId === bead.id} onSelect={onSelect} />
              <HalfLine kind={nextKind} height={d.line} />
            </div>
            <span
              style={{
                marginTop: 4, maxWidth: d.cell - 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: d.label, lineHeight: 1.25,
                color: labelColor(bead.state), fontWeight: bead.state === 'running' ? 600 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center',
              }}
            >
              {bead.label}
            </span>
            {bead.sublabel && (
              <span style={{ maxWidth: d.cell - 6, fontSize: '0.54rem', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bead.sublabel}</span>
            )}
          </div>
        );
      })}

      {ghost && (
        <div style={{ flex: 'none', width: d.cell, paddingTop: hasSections ? d.section : 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: d.bead }}>
            <HalfLine kind={beads.length ? 'build' : null} height={d.line} />
            <span
              className="rs-anim"
              aria-label={ghost.label}
              style={{
                position: 'relative', flex: 'none', width: d.bead, height: d.bead, borderRadius: BEAD_RADIUS, display: 'grid', placeItems: 'center',
                border: `1.5px dashed ${ghost.tone === 'building' ? '#8FA3B2' : '#D9A196'}`,
                color: ghost.tone === 'building' ? '#3D5A6E' : '#B34A3C',
                background: ghost.tone === 'building' ? '#F2F5F7' : '#FAF0ED',
                animation: ghost.tone === 'building' ? 'rsBreathe 1.6s ease-in-out infinite' : undefined,
              }}
            >
              <span style={{ display: 'grid', placeItems: 'center' }}>
                <Glyph name={ghost.tone === 'building' ? 'add' : 'cross'} size={d.glyph - 1} />
              </span>
            </span>
            <div style={{ flex: 1, height: d.line }} />
          </div>
          <span style={{ position: 'relative', display: 'inline-block', maxWidth: d.cell - 6, marginTop: 4 }}>
            <span
              style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: d.label, color: ghost.tone === 'building' ? '#3D5A6E' : '#B34A3C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {ghost.label}
            </span>
            {ghost.tone === 'building' && (
              // Absolutely positioned after the text: the label stays put and the dots grow to its right.
              <span aria-hidden="true" style={{ position: 'absolute', left: '100%', top: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: d.label, color: '#3D5A6E', whiteSpace: 'nowrap' }}>
                <span className="rs-dot rs-dot1">.</span><span className="rs-dot rs-dot2">.</span><span className="rs-dot rs-dot3">.</span>
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
