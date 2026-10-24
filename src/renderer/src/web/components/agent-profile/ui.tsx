// components/agent-profile/ui.tsx
'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';

// Small pieces shared by the Agent Profile: an icon tile, a section card with an icon and a one-line purpose, a usage bar and a disclosure.

export function IconTile({ icon, color = C.brassDeep, size = 30 }: { icon: IconName; color?: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: Math.round(size * 0.3), display: 'grid', placeItems: 'center', color, background: `${color}14`, border: `1px solid ${color}30` }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** A card with an icon tile, a title and what it is for, then the fields. */
export function SectionCard({ icon, color, title, description, aside, children }: {
  icon: IconName; color?: string; title: string; description?: ReactNode; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '1.15rem 1.4rem 0.4rem' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', marginBottom: '1.1rem' }}>
        <IconTile icon={icon} color={color} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 500, color: C.ink, margin: 0, lineHeight: 1.4 }}>{title}</h2>
          {description && <p style={{ fontSize: '0.78rem', color: C.soft, margin: '0.15rem 0 0', lineHeight: 1.55 }}>{description}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

export type BarTone = 'brass' | 'amber' | 'red' | 'green';
const BAR: Record<BarTone, { fg: string; bg: string; line: string }> = {
  brass: { fg: C.brass, bg: C.brassTint, line: C.brassLine },
  amber: { fg: C.amber, bg: C.amberWash, line: C.amberLine },
  red: { fg: C.red, bg: C.redWash, line: C.redLine },
  green: { fg: C.green, bg: C.greenWash, line: C.greenLine },
};

export function toneFor(ratio: number): BarTone {
  return ratio >= 1 ? 'red' : ratio >= 0.8 ? 'amber' : 'brass';
}

/** One usage line: what it is, how much of its allowance is used (a percentage, not a count) and a thin bar. */
export function UsageBar({ icon, color, label, percent, caption, aside, title }: {
  icon: IconName; color?: string; label: string; percent: number | null; caption?: ReactNode; aside?: ReactNode; title?: string;
}) {
  const ratio = percent === null ? 0 : percent / 100;
  const t = BAR[toneFor(ratio)];
  return (
    <div title={title}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <IconTile icon={icon} color={color} size={28} />
        <span style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, flex: 1, minWidth: 0 }}>{label}</span>
        {aside}
        <span style={{ fontFamily: MONO, fontSize: '0.74rem', color: percent === null ? C.faint : ratio >= 1 ? C.red : C.ink, fontVariantNumeric: 'tabular-nums' }}>{percent === null ? '–' : `${percent}%`}</span>
      </div>
      <div role="progressbar" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
        style={{ height: 5, borderRadius: 5, background: t.bg, border: `1px solid ${t.line}`, overflow: 'hidden', boxSizing: 'content-box', margin: '0.5rem 0 0' }}>
        <div style={{ width: `${Math.min(100, percent ?? 0)}%`, height: '100%', background: t.fg, borderRadius: 5, transition: 'width 0.4s ease' }} />
      </div>
      {caption && <p style={{ fontSize: '0.72rem', color: C.soft, margin: '0.4rem 0 0', lineHeight: 1.55 }}>{caption}</p>}
    </div>
  );
}

/** A "Details" toggle that keeps secondary lines out of the way until asked for. */
export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="ap-disclosure" style={{ marginTop: '0.55rem' }}>
      <summary style={{ cursor: 'pointer', listStyle: 'none', fontSize: '0.72rem', color: C.muted, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
        <span className="ap-chev" style={{ display: 'inline-flex', transition: 'transform 0.12s' }}><Icon name="chevron-right" size={12} /></span>{label}
      </summary>
      <div style={{ marginTop: '0.45rem' }}>{children}</div>
    </details>
  );
}

export const UI_CSS = `
  .ap-disclosure > summary::-webkit-details-marker { display: none; }
  .ap-disclosure > summary:hover { color: ${C.soft}; }
  .ap-disclosure[open] > summary .ap-chev { transform: rotate(90deg); }
`;
