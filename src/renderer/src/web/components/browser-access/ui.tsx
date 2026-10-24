// components/browser-access/ui.tsx
'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';

// Small shared pieces of the Browser Access tab: field and button styles, a spinner, a modal, a status chip, and a section label. Stone & Brass, inline
// styles; the few rules that need :hover / :focus live in BA_CSS, which the page renders once.

export const BA_CSS = `
  .ba-field { width: 100%; box-sizing: border-box; padding: 0.5rem 0.7rem; font-size: 0.8rem; font-family: 'Inter', sans-serif; color: ${C.ink}; background: #fff;
    border: 1px solid #DAD5C5; border-radius: 8px; outline: none; transition: border-color 0.15s, box-shadow 0.15s; line-height: 1.5; }
  .ba-field:hover { border-color: #C9C4B2; }
  .ba-field:focus { border-color: ${C.brass}; box-shadow: 0 0 0 3px rgba(161,127,58,0.16); }
  .ba-field::placeholder { color: #B9B4A2; }
  .ba-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; height: 26px; padding: 0 0.65rem; font-size: 0.72rem; font-weight: 500;
    font-family: 'Inter', sans-serif; border-radius: 7px; cursor: pointer; white-space: nowrap; transition: background 0.15s, border-color 0.15s, color 0.15s; }
  .ba-btn:focus-visible { outline: 2px solid ${C.brass}; outline-offset: 2px; }
  .ba-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ba-btn-md { height: 32px; padding: 0 0.95rem; font-size: 0.8rem; border-radius: 8px; }
  .ba-primary { background: ${C.ink}; color: #F7F6F2; border: 1px solid ${C.ink}; }
  .ba-primary:hover:not(:disabled) { background: #3A3830; border-color: #3A3830; }
  .ba-outline { background: #fff; color: ${C.body}; border: 1px solid #DAD5C5; }
  .ba-outline:hover:not(:disabled) { background: ${C.surface}; border-color: #C9C4B2; }
  .ba-ghost { background: transparent; color: ${C.soft}; border: 1px solid transparent; }
  .ba-ghost:hover:not(:disabled) { background: #F0EEE5; color: ${C.ink}; }
  .ba-danger { background: #fff; color: ${C.red}; border: 1px solid ${C.redLine}; }
  .ba-danger:hover:not(:disabled) { background: ${C.redWash}; }
  .ba-tab { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.7rem; font-size: 0.76rem; font-family: 'Inter', sans-serif; color: ${C.soft};
    background: transparent; border: 1px solid transparent; border-radius: 999px; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .ba-tab:hover { background: #F0EEE5; color: ${C.ink}; }
  .ba-tab[aria-selected="true"] { background: ${C.ink}; color: #F7F6F2; }
  .ba-tab:focus-visible { outline: 2px solid ${C.brass}; outline-offset: 2px; }
  .ba-row:hover { background: ${C.paper}; }
  .ba-card { transition: border-color 0.15s, box-shadow 0.15s; }
  .ba-card:hover { border-color: #CFC9B6; }
  @media (max-width: 760px) { .ba-hide-sm { display: none !important; } }
`;

export function Btn({ variant = 'outline', size = 'sm', icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
}) {
  return (
    <button type="button" {...rest} className={`ba-btn ba-${variant}${size === 'md' ? ' ba-btn-md' : ''}`}>
      {icon && <Icon name={icon} size={size === 'md' ? 14 : 12} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 14, color = C.ink }: { size?: number; color?: string }) {
  return (
    <>
      <span style={{ display: 'inline-block', width: size, height: size, border: '1.5px solid #DAD5C5', borderTopColor: color, borderRadius: '50%', animation: 'ba-spin 0.8s linear infinite', flexShrink: 0 }} />
      <style>{`@keyframes ba-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

export function IconTile({ icon, color = C.brassDeep, size = 34 }: { icon: IconName; color?: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: Math.round(size * 0.3), display: 'grid', placeItems: 'center', color, background: `${color}14`, border: `1px solid ${color}30` }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

const TONES = {
  neutral: { fg: C.soft, bg: '#EDEBE2', line: '#DAD5C5' },
  brass: { fg: C.brassDeep, bg: C.brassWash, line: C.brassLine },
  green: { fg: C.green, bg: C.greenWash, line: C.greenLine },
  red: { fg: C.red, bg: C.redWash, line: C.redLine },
  amber: { fg: C.amber, bg: C.amberWash, line: C.amberLine },
  slate: { fg: C.slate, bg: C.slateWash, line: C.slateLine },
} as const;

export function Chip({ tone = 'neutral', dot = false, children, title }: { tone?: keyof typeof TONES; dot?: boolean; children: ReactNode; title?: string }) {
  const t = TONES[tone];
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: t.fg, background: t.bg, border: `1px solid ${t.line}`, borderRadius: 999, padding: '0.12rem 0.5rem', whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.fg }} />}
      {children}
    </span>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ marginBottom: '0.45rem' }}>
      <p style={{ fontSize: '0.78rem', fontWeight: 500, color: C.ink, margin: 0 }}>{children}</p>
      {hint && <p style={{ fontSize: '0.72rem', color: C.soft, margin: '0.15rem 0 0', lineHeight: 1.55 }}>{hint}</p>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: '0.74rem', color: C.red, margin: 0, lineHeight: 1.5 }}>{children}</p>;
}

export const formLabel: CSSProperties = { fontSize: '0.76rem', fontWeight: 500, color: C.body, display: 'block', marginBottom: '0.3rem' };

export function Modal({ title, subtitle, icon, onClose, children }: { title: string; subtitle?: ReactNode; icon?: IconName; onClose: () => void; children: ReactNode }) {
  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(38,37,30,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '1.4rem 1.5rem 1.5rem', width: 460, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(38,37,30,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.1rem' }}>
          {icon && <IconTile icon={icon} />}
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.15rem', fontWeight: 500, color: '#514726', margin: 0, lineHeight: 1.3 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: '0.76rem', color: C.soft, margin: '0.1rem 0 0' }}>{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export async function post(url: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) return { ok: false, error: data.error || 'Something went wrong.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}

export function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      style={{ width: 30, height: 17, borderRadius: 9, border: 'none', cursor: 'pointer', background: on ? C.ink : '#DAD5C5', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  );
}
