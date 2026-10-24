// components/agent-ui/TabHeader.tsx
'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

// The heading of an agent tab: a short title, one muted line under it, and the tab's actions on the right.
// There is deliberately no eyebrow: the window's top bar already names the tab, so repeating it above the title
// only cost vertical space. Longer explanations go in `note`, folded behind "How this works" until asked for.

const STYLES = `
  .tb-btn { display: inline-flex; align-items: center; gap: 0.4rem; height: 30px; padding: 0 0.85rem; font-size: 0.78rem; font-weight: 500;
    font-family: 'Inter', sans-serif; border-radius: 6px; cursor: pointer; white-space: nowrap; flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s, color 0.15s; }
  .tb-btn:focus-visible { outline: 2px solid #A17F3A; outline-offset: 2px; }
  .tb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .tb-btn-primary { background: #26251E; color: #F7F6F2; border: 1px solid #26251E; }
  .tb-btn-primary:hover:not(:disabled) { background: #3A3830; border-color: #3A3830; }
  .tb-btn-outline { background: transparent; color: #26251E; border: 1px solid #DAD5C5; }
  .tb-btn-outline:hover:not(:disabled) { background: #EDEBE2; border-color: #C9C4B2; }
  .tb-note > summary { list-style: none; cursor: pointer; font-size: 0.72rem; color: #9E9C8F; display: inline-flex; align-items: center; gap: 0.3rem; }
  .tb-note > summary::-webkit-details-marker { display: none; }
  .tb-note > summary:hover { color: #67655A; }
  .tb-note[open] > summary { color: #67655A; }
`;

const PLUS = (
  <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden="true">
    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export function HeaderButton({ variant = 'primary', plus = false, children, ...rest }: {
  variant?: 'primary' | 'outline';
  plus?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'>) {
  return (
    <button type="button" {...rest} className={`tb-btn tb-btn-${variant}`}>
      <style>{STYLES}</style>
      {plus && PLUS}
      {children}
    </button>
  );
}

export function TabHeader({ title, subtitle, note, actions, marginBottom = '1.1rem' }: {
  title: string;
  subtitle?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  marginBottom?: string;
}) {
  return (
    <header style={{ marginBottom }}>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, letterSpacing: '-0.01em', color: '#514726', margin: 0, lineHeight: 1.3 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: '0.78rem', color: '#67655A', margin: '0.15rem 0 0', lineHeight: 1.5, maxWidth: 760 }}>{subtitle}</p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>{actions}</div>}
      </div>
      {note && (
        <details className="tb-note" style={{ marginTop: '0.45rem' }}>
          <summary>How this works</summary>
          <div style={{ fontSize: '0.78rem', color: '#67655A', lineHeight: 1.6, marginTop: '0.4rem', maxWidth: 760 }}>{note}</div>
        </details>
      )}
    </header>
  );
}
