// components/projects/ProjectRail.tsx
'use client';

import { Icon, type IconName } from '@/components/icons/Icon';
import { INK, MONO, MUTED } from './tokens';

// A small, quiet row of beads joined by a hairline. Two sizes:
//   sm -- the card strip: tiny beads, no labels, readable at a glance (done = green, now = brass with a soft glow). A bead that has an icon (a follow-up's
//         scheduled / wakes / task / replies) is a small tile with that picture; the rest are dots.
//   md -- the project panel: small rounded tiles with a number or a kind picture, a label under each, clickable.
// Purely presentational: callers pass items and get clicks back.

export type BeadKind = 'step' | 'tool' | 'task' | 'question' | 'decision' | 'note';
export type BeadStatus = 'done' | 'doing' | 'todo' | 'skipped' | 'failed';

export interface RailItem {
  id: string;
  label: string;
  status: BeadStatus;
  kind?: BeadKind;
  /** a picture for the bead (used instead of a dot / number) */
  icon?: IconName;
  title: string;
}

const KIND_COLOR: Record<BeadKind, string> = {
  step: '#5E9A70', tool: '#3D5A6E', task: '#7C5F27', question: '#B5651D', decision: '#5B4B8A', note: '#9E9C8F',
};
const GREEN = '#5E9A70';
const BRASS = '#A17F3A';
const RING = '#CBC5B1';
const RED = '#B34A3C';
const LINE = '#DAD5C5';
const LINE_DONE = '#8DBA9A';

export const RAIL_STYLES = `
  @keyframes prPing { 0% { transform: scale(1); opacity: .5; } 80%, 100% { transform: scale(2.1); opacity: 0; } }
  @keyframes prGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(201,162,77,0); } 50% { box-shadow: 0 0 0 3px rgba(201,162,77,.3); } }
  .pr-ping { animation: prPing 1.8s ease-out infinite; }
  .pr-glow { animation: prGlow 1.8s ease-in-out infinite; }
  .pr-bead { transition: transform .12s ease, box-shadow .12s ease; }
  button.pr-bead:hover { transform: translateY(-1px); }
  button.pr-bead:focus-visible { outline: 2px solid #26251E; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .pr-ping, .pr-glow, .pr-bead { animation: none !important; transition: none !important; } }
`;

const KIND_ICON: Partial<Record<BeadKind, IconName>> = { tool: 'wrench', task: 'list-checks', question: 'circle-question-mark', decision: 'split', note: 'sticky-note' };

function KindIcon({ kind, color, icon }: { kind: BeadKind; color: string; icon?: IconName }) {
  const name = icon ?? KIND_ICON[kind];
  if (name) return <Icon name={name} size={11} strokeWidth={2} color={color} />;
  return <span style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />;
}

function SmallBead({ item }: { item: RailItem }) {
  const s = item.status;
  if (item.icon) {
    const look =
      s === 'done' ? { bg: '#E5F0E7', border: `1px solid #8DBA9A`, fg: GREEN }
      : s === 'doing' ? { bg: '#FBF6E6', border: `1px solid ${BRASS}`, fg: BRASS }
      : s === 'failed' ? { bg: '#F5E6E1', border: `1px solid ${RED}`, fg: RED }
      : s === 'skipped' ? { bg: 'transparent', border: `1px dashed ${RING}`, fg: MUTED }
      : { bg: '#fff', border: `1px solid ${LINE}`, fg: MUTED };
    return (
      <span
        title={item.title} aria-label={item.title} className={s === 'doing' ? 'pr-glow' : undefined}
        style={{ width: 16, height: 16, borderRadius: 5, flex: 'none', boxSizing: 'border-box', display: 'grid', placeItems: 'center', background: look.bg, border: look.border, color: look.fg }}
      >
        <Icon name={item.icon} size={10} strokeWidth={2.2} />
      </span>
    );
  }
  const base = { position: 'relative' as const, width: 9, height: 9, borderRadius: '50%', flex: 'none' as const, boxSizing: 'border-box' as const };
  const style =
    s === 'done' ? { ...base, background: GREEN, border: `1.5px solid ${GREEN}` }
    : s === 'doing' ? { ...base, background: '#fff', border: `2px solid ${BRASS}` }
    : s === 'failed' ? { ...base, background: RED, border: `1.5px solid ${RED}` }
    : s === 'skipped' ? { ...base, background: 'transparent', border: `1.5px dashed ${RING}` }
    : { ...base, background: '#fff', border: `1.5px solid ${RING}` };
  return (
    <span title={item.title} aria-label={item.title} style={style}>
      {s === 'doing' && <span className="pr-ping" style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `1.5px solid ${BRASS}` }} />}
    </span>
  );
}

function lineColor(from: RailItem): string {
  return from.status === 'done' || from.status === 'skipped' ? LINE_DONE : LINE;
}

function MediumBead({ item, selected, onSelect }: { item: RailItem; selected: boolean; onSelect?: (id: string) => void }) {
  const kind = item.kind ?? 'step';
  const color = KIND_COLOR[kind];
  const s = item.status;
  const step = kind === 'step' && !item.icon;
  let bg = '#fff';
  let border = `1.5px solid ${RING}`;
  let fg = MUTED;
  if (s === 'done') { bg = step ? GREEN : `${color}1F`; border = `1.5px solid ${step ? GREEN : color}`; fg = step ? '#fff' : color; }
  else if (s === 'doing') { bg = '#FBF6E6'; border = `1.5px solid ${BRASS}`; fg = BRASS; }
  else if (s === 'failed') { bg = '#F5E6E1'; border = `1.5px solid ${RED}`; fg = RED; }
  else if (s === 'skipped') { bg = 'transparent'; border = `1.5px dashed ${RING}`; fg = MUTED; }
  else if (!step) { border = `1.5px dashed ${color}99`; fg = color; }
  const content = step
    ? <span style={{ fontFamily: MONO, fontSize: '0.6rem', fontWeight: 600, color: fg, lineHeight: 1 }}>{item.label.match(/^\d+/)?.[0] ?? ''}</span>
    : <KindIcon kind={kind} color={fg} icon={item.icon} />;
  return (
    <button
      type="button" className={`pr-bead${s === 'doing' ? ' pr-glow' : ''}`} onClick={() => onSelect?.(item.id)} title={item.title} aria-label={item.title} aria-pressed={selected}
      style={{
        position: 'relative', flex: 'none', width: 20, height: 20, padding: 0, borderRadius: 7, display: 'grid', placeItems: 'center',
        background: bg, border, cursor: onSelect ? 'pointer' : 'default',
        boxShadow: selected ? `0 0 0 2px ${(s === 'failed' ? RED : s === 'doing' ? BRASS : color)}40` : undefined,
      }}
    >
      {content}
    </button>
  );
}

export default function ProjectRail({ items, size = 'sm', selectedId = null, onSelect, ariaLabel }: {
  items: RailItem[];
  size?: 'sm' | 'md';
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  ariaLabel: string;
}) {
  if (items.length === 0) return null;
  if (size === 'sm') {
    return (
      <div role="img" aria-label={ariaLabel} style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <style>{RAIL_STYLES}</style>
        {items.map((item, i) => (
          <span key={item.id} style={{ display: 'flex', alignItems: 'center' }}>
            <SmallBead item={item} />
            {i < items.length - 1 && <span style={{ width: 16, height: 1.5, background: lineColor(item), borderRadius: 1 }} />}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', overflowX: 'auto', paddingBottom: 2 }} className="pr-scroll">
      <style>{RAIL_STYLES}</style>
      {items.map((item, i) => (
        <div key={item.id} style={{ flex: 'none', width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 24 }}>
            <span style={{ flex: 1, height: 1.5, background: i === 0 ? 'transparent' : lineColor(items[i - 1]), borderRadius: 1 }} />
            <MediumBead item={item} selected={selectedId === item.id} onSelect={onSelect} />
            <span style={{ flex: 1, height: 1.5, background: i === items.length - 1 ? 'transparent' : lineColor(item), borderRadius: 1 }} />
          </div>
          <span style={{
            marginTop: 4, padding: '0 4px', fontSize: '0.62rem', lineHeight: 1.3, textAlign: 'center', color: item.status === 'todo' ? MUTED : INK,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere',
          }}>
            {item.label.replace(/^\d+\.\s*/, '')}
          </span>
        </div>
      ))}
    </div>
  );
}
