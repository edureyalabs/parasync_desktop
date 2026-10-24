// components/tool-builder/ui.tsx
'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';

// Shared presentational pieces for the Tool Builder: one panel style (an icon tile, a title, a one-line purpose, then the fields), labelled fields with
// their hint and error under them, buttons, switches and notices. Stone & Brass palette, inline styles; the few rules that need :hover / :focus live in
// FIELD_CSS, which the editor renders once.

export const labelStyle: CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 500, color: C.body, marginBottom: '0.35rem',
};

export const hintStyle: CSSProperties = { fontSize: '0.74rem', color: C.soft, margin: '0.3rem 0 0', lineHeight: 1.55 };

export const FIELD_CSS = `
  .tool-field {
    width: 100%; padding: 0.55rem 0.75rem; font-size: 0.86rem; font-family: 'Inter', sans-serif; color: ${C.ink}; background: #fff;
    border: 1px solid #DAD5C5; border-radius: 8px; outline: none; transition: border-color 0.15s, box-shadow 0.15s; box-sizing: border-box; line-height: 1.5;
  }
  .tool-field:hover { border-color: #C9C4B2; }
  .tool-field:focus { border-color: ${C.brass}; box-shadow: 0 0 0 3px rgba(161,127,58,0.16); }
  .tool-field::placeholder { color: #B9B4A2; }
  .tool-field[aria-invalid="true"] { border-color: ${C.red}; }
  .tool-field-sm { padding: 0.4rem 0.6rem; font-size: 0.8rem; border-radius: 7px; }
  select.tool-field { appearance: none; padding-right: 1.9rem; cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2367655A' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 0.7rem center; }
  .tbx-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; font-family: 'Inter', sans-serif; font-weight: 500; border-radius: 8px;
    cursor: pointer; white-space: nowrap; transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s; }
  .tbx-btn:focus-visible { outline: 2px solid ${C.brass}; outline-offset: 2px; }
  .tbx-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .tbx-md { padding: 0.5rem 1rem; font-size: 0.82rem; }
  .tbx-sm { padding: 0.3rem 0.7rem; font-size: 0.74rem; border-radius: 7px; }
  .tbx-primary { background: ${C.ink}; color: #F7F6F2; border: 1px solid ${C.ink}; }
  .tbx-primary:hover:not(:disabled) { background: #3A3830; border-color: #3A3830; }
  .tbx-outline { background: #fff; color: ${C.body}; border: 1px solid #DAD5C5; }
  .tbx-outline:hover:not(:disabled) { background: ${C.surface}; border-color: #C9C4B2; }
  .tbx-ghost { background: transparent; color: ${C.soft}; border: 1px solid transparent; }
  .tbx-ghost:hover:not(:disabled) { background: #F0EEE5; color: ${C.ink}; }
  .tbx-danger { background: #fff; color: ${C.red}; border: 1px solid ${C.redLine}; }
  .tbx-danger:hover:not(:disabled) { background: ${C.redWash}; }
  .tbx-step { display: flex; align-items: center; gap: 0.7rem; width: 100%; text-align: left; border: 1px solid transparent; background: transparent; border-radius: 10px;
    padding: 0.55rem 0.65rem; cursor: pointer; font-family: 'Inter', sans-serif; transition: background 0.15s, border-color 0.15s; }
  .tbx-step:hover { background: #F0EEE5; }
  .tbx-step[aria-current="step"] { background: #fff; border-color: ${C.line}; box-shadow: 0 1px 2px rgba(38,37,30,0.05); }
  .tbx-step:focus-visible { outline: 2px solid ${C.brass}; outline-offset: 1px; }
  .tbx-choice { text-align: left; border: 1px solid #DAD5C5; background: #fff; border-radius: 10px; padding: 0.8rem 0.9rem; cursor: pointer; font-family: 'Inter', sans-serif;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s; }
  .tbx-choice:hover { border-color: #C9C4B2; }
  .tbx-choice[aria-pressed="true"] { border-color: ${C.brass}; background: ${C.brassTint}; box-shadow: 0 0 0 3px rgba(161,127,58,0.12); }
  .tbx-choice:focus-visible { outline: 2px solid ${C.brass}; outline-offset: 2px; }
  @media (max-width: 860px) {
    .tbx-layout { flex-direction: column !important; }
    .tbx-rail { position: static !important; width: 100% !important; flex-direction: row !important; overflow-x: auto; padding-bottom: 0.3rem; }
    .tbx-rail .tbx-step { width: auto; flex-shrink: 0; }
    .tbx-rail .tbx-step-caption { display: none; }
  }
`;

export function Btn({ variant = 'outline', size = 'md', icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: IconName;
}) {
  return (
    <button type="button" {...rest} className={`tbx-btn tbx-${size} tbx-${variant}`}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

/** A rounded tile holding an icon, in a tint of one colour. */
export function IconTile({ icon, color = C.brassDeep, size = 32 }: { icon: IconName; color?: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: Math.round(size * 0.3), display: 'grid', placeItems: 'center', color, background: `${color}14`, border: `1px solid ${color}30` }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** One section of a step: an icon tile, a title, a line saying what it is for, then the fields. */
export function Panel({ icon, color, title, description, aside, children, style }: {
  icon: IconName;
  color?: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '1.15rem 1.3rem 1.3rem', ...style }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', marginBottom: '1rem' }}>
        <IconTile icon={icon} color={color} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 500, color: C.ink, margin: 0, lineHeight: 1.4 }}>{title}</h3>
          {description && <p style={{ fontSize: '0.78rem', color: C.soft, margin: '0.15rem 0 0', lineHeight: 1.55 }}>{description}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** A labelled input with its hint and its error underneath. */
export function Field({ label, required, optional, hint, error, children }: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: C.red }}> *</span>}
        {optional && <span style={{ color: C.muted, fontWeight: 400 }}> · optional</span>}
      </label>
      {children}
      {error ? <p style={{ fontSize: '0.74rem', color: C.red, margin: '0.35rem 0 0' }}>{error}</p> : hint ? <p style={hintStyle}>{hint}</p> : null}
    </div>
  );
}

export function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

export function Toggle({ on, onClick, title, label }: { on: boolean; onClick: () => void; title?: string; label?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label ?? title} onClick={onClick} title={title}
      style={{ width: 38, height: 21, borderRadius: 11, border: 'none', cursor: 'pointer', background: on ? C.ink : '#DAD5C5', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  );
}

type Tone = 'error' | 'warning' | 'info' | 'success';
const NOTICE: Record<Tone, { bg: string; line: string; fg: string; icon: IconName }> = {
  error: { bg: C.redWash, line: C.redLine, fg: C.red, icon: 'triangle-alert' },
  warning: { bg: C.amberWash, line: C.amberLine, fg: C.amber, icon: 'triangle-alert' },
  info: { bg: C.slateWash, line: C.slateLine, fg: C.slate, icon: 'info' },
  success: { bg: C.greenWash, line: C.greenLine, fg: C.green, icon: 'circle-check' },
};

export function Notice({ tone = 'info', children, style }: { tone?: Tone; children: ReactNode; style?: CSSProperties }) {
  const t = NOTICE[tone];
  return (
    <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', padding: '0.6rem 0.8rem', background: t.bg, border: `1px solid ${t.line}`, borderRadius: 8, color: t.fg, fontSize: '0.78rem', lineHeight: 1.55, ...style }}>
      <span style={{ marginTop: 2 }}><Icon name={t.icon} size={14} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

/** Problems found by the checks, one per line (code problems carry their line number). */
export function IssueList({ issues, tone = 'error' }: { issues: string[]; tone?: 'error' | 'warning' }) {
  if (issues.length === 0) return null;
  return (
    <Notice tone={tone} style={{ marginTop: '0.6rem' }}>
      {issues.map((m, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : '0.25rem 0 0', fontFamily: MONO, fontSize: '0.74rem' }}>{m}</p>
      ))}
    </Notice>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brass' | 'green' | 'violet' | 'slate' }) {
  const t = {
    neutral: { fg: C.soft, bg: '#EDEBE2', line: '#DAD5C5' },
    brass: { fg: C.brassDeep, bg: C.brassWash, line: C.brassLine },
    green: { fg: C.green, bg: C.greenWash, line: C.greenLine },
    violet: { fg: '#5B4B8A', bg: '#EAE5F4', line: '#CDC3E3' },
    slate: { fg: C.slate, bg: C.slateWash, line: C.slateLine },
  }[tone];
  return (
    <span style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: t.fg, background: t.bg, border: `1px solid ${t.line}`, borderRadius: 999, padding: '0.12rem 0.5rem', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
