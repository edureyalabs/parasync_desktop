// components/account/ui.tsx
'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { C, MONO } from './tokens';

// The small set of pieces every Account page is built from, so the five tabs read as one
// product: a page frame (eyebrow, title, actions), cards, status chips, buttons, stat tiles
// and meters. Inline styles, same convention as the rest of the app; the few rules that need
// :hover / :focus live in the one <style> block AccountPage renders.

export function Spinner({ size = 18, color = C.ink }: { size?: number; color?: string }) {
  return (
    <>
      <span style={{ display: 'inline-block', width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'ac-spin 0.8s linear infinite', flexShrink: 0 }} />
      <style>{`@keyframes ac-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

export function PageLoading() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner />
    </div>
  );
}

/** The frame of an Account page: eyebrow + title + optional actions, then the content. */
export function AccountPage({ eyebrow, title, subtitle, actions, maxWidth = 1240, compact = false, children }: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  maxWidth?: number | string;
  /** Agent tabs: no eyebrow (the window's top bar already names the tab), a smaller title and less top padding. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <main style={{ maxWidth, margin: '0 auto', padding: compact ? '1.25rem 2rem 3rem' : '2.5rem 2.5rem 4rem', animation: 'ac-fade-up 0.35s ease both' }}>
      <style>{`
        @keyframes ac-fade-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .ac-btn { transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, opacity 0.15s; }
        .ac-btn:focus-visible { outline: 2px solid ${C.brass}; outline-offset: 2px; }
        .ac-btn-primary:hover:not(:disabled) { background: #3A3830; }
        .ac-btn-brass:hover:not(:disabled) { background: ${C.brassDeep}; }
        .ac-btn-outline:hover:not(:disabled) { background: ${C.surface}; border-color: #C9C4B2; }
        .ac-btn-ghost:hover:not(:disabled) { background: #F0EEE5; }
        .ac-card-hover { transition: box-shadow 0.18s, border-color 0.18s, transform 0.18s; }
        .ac-card-hover:hover { border-color: #CFC9B6; box-shadow: 0 4px 18px rgba(38,37,30,0.07); }
        .ac-row:hover { background: ${C.paper}; }
        @media (prefers-reduced-motion: reduce) { main { animation: none !important; } }
        @media (max-width: 760px) { .ac-page-pad { padding-left: 1rem !important; padding-right: 1rem !important; } }
      `}</style>
      <header style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-end', justifyContent: 'space-between', gap: compact ? '1rem' : '1.5rem', flexWrap: 'wrap', marginBottom: compact ? '1.1rem' : '1.75rem' }}>
        <div style={{ minWidth: 0 }}>
          {!compact && <p style={{ fontFamily: MONO, fontSize: '0.7rem', color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>{eyebrow}</p>}
          <h1 style={compact
            ? { fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, letterSpacing: '-0.01em', margin: 0, color: '#514726', lineHeight: 1.3 }
            : { fontSize: '1.6rem', fontWeight: 500, letterSpacing: '-0.03em', margin: 0, color: C.ink }}>{title}</h1>
          {subtitle && <p style={{ fontSize: compact ? '0.78rem' : '0.86rem', color: compact ? '#67655A' : C.soft, margin: compact ? '0.15rem 0 0' : '0.5rem 0 0', lineHeight: compact ? 1.5 : 1.6, maxWidth: compact ? 760 : 680 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>{actions}</div>}
      </header>
      {children}
    </main>
  );
}

export function Card({ children, pad = '1.25rem 1.4rem', style, hover = false }: {
  children: ReactNode; pad?: string; style?: CSSProperties; hover?: boolean;
}) {
  return (
    <section className={hover ? 'ac-card-hover' : undefined} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: pad, ...style }}>
      {children}
    </section>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
      <h2 style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 500, color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>{children}</h2>
      {aside}
    </div>
  );
}

type Tone = 'green' | 'amber' | 'red' | 'brass' | 'slate' | 'neutral';

const TONES: Record<Tone, { fg: string; bg: string; line: string }> = {
  green: { fg: C.green, bg: C.greenWash, line: C.greenLine },
  amber: { fg: C.amber, bg: C.amberWash, line: C.amberLine },
  red: { fg: C.red, bg: C.redWash, line: C.redLine },
  brass: { fg: C.brassDeep, bg: C.brassWash, line: C.brassLine },
  slate: { fg: C.slate, bg: C.slateWash, line: C.slateLine },
  neutral: { fg: C.soft, bg: '#EDEBE2', line: '#DAD5C5' },
};

export function toneColors(tone: Tone) { return TONES[tone]; }

/** A status / category chip. Always carries text (never colour alone); `dot` adds a status light. */
export function Chip({ tone = 'neutral', dot = false, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  const t = TONES[tone];
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.36rem', fontFamily: MONO, fontSize: '0.63rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: t.fg, background: t.bg, border: `1px solid ${t.line}`, borderRadius: 999, padding: '0.16rem 0.55rem', whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'brass' | 'outline' | 'ghost';

export function Btn({ variant = 'outline', size = 'md', style, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  const base: CSSProperties = {
    fontFamily: "'Inter', sans-serif", cursor: rest.disabled ? 'not-allowed' : 'pointer', borderRadius: 6,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', whiteSpace: 'nowrap',
    padding: size === 'sm' ? '0.3rem 0.7rem' : '0.55rem 1.1rem', fontSize: size === 'sm' ? '0.74rem' : '0.82rem',
    opacity: rest.disabled ? 0.55 : 1,
  };
  const look: Record<BtnVariant, CSSProperties> = {
    primary: { background: C.ink, color: '#F7F6F2', border: '1px solid transparent' },
    brass: { background: C.brass, color: '#fff', border: '1px solid transparent' },
    outline: { background: 'transparent', color: C.body, border: '1px solid #DAD5C5' },
    ghost: { background: 'transparent', color: C.body, border: '1px solid transparent' },
  };
  return (
    <button {...rest} className={`ac-btn ac-btn-${variant}${className ? ` ${className}` : ''}`} style={{ ...base, ...look[variant], ...style }}>
      {children}
    </button>
  );
}

/** A figure with a label: the "stat tile". Values use proportional figures (big numbers); put
 *  `tabular` on only where numbers must line up in a column. */
export function Stat({ label, value, sub, tone, valueSize = '1.5rem' }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; valueSize?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.4rem' }}>{label}</p>
      <p style={{ fontSize: valueSize, fontWeight: 500, letterSpacing: '-0.025em', margin: 0, color: tone ? TONES[tone].fg : C.ink, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.74rem', color: C.soft, margin: '0.4rem 0 0' }}>{sub}</p>}
    </div>
  );
}

/** A thin meter: the fill carries state, the track is a lighter step of the same hue. */
export function Meter({ value, tone = 'brass', height = 6 }: { value: number; tone?: Tone; height?: number }) {
  const t = TONES[tone];
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div role="presentation" style={{ height, borderRadius: height, background: t.bg, border: `1px solid ${t.line}`, overflow: 'hidden', boxSizing: 'content-box' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: t.fg, borderRadius: height, transition: 'width 0.4s ease' }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
      <span style={{ width: 52, height: 52, borderRadius: '50%', border: `1.5px dashed ${C.brassLine}`, background: C.brassTint, color: C.brass, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <p style={{ fontSize: '0.95rem', fontWeight: 500, color: C.ink, margin: '1rem 0 0.35rem' }}>{title}</p>
      {children && <p style={{ fontSize: '0.82rem', lineHeight: 1.6, color: C.soft, margin: '0 auto', maxWidth: 380 }}>{children}</p>}
      {action && <div style={{ marginTop: '1.25rem' }}>{action}</div>}
    </div>
  );
}
