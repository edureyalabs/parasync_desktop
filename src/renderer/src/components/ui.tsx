// src/renderer/src/components/ui.tsx
import { useState, type CSSProperties, type ReactNode } from 'react';

import { C, MONO } from '@/lib/theme';
import { initials } from '@/lib/format';
import { Icon, type IconName } from '@/components/Icon';

export function Spinner({ size = 18, color = C.brass }: { size?: number; color?: string }) {
  return (
    <svg className="ps-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</div>;
}

export function Avatar({ name, url, size = 44, ring = false, ringGap = '#fff' }: { name: string; url?: string | null; size?: number; ring?: boolean; ringGap?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!url && !failed;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: showImage ? C.sunken : C.brassBg, color: C.brassDeep,
        fontFamily: MONO, fontSize: size * 0.34, fontWeight: 500,
        boxShadow: ring ? `0 0 0 2px ${ringGap}, 0 0 0 3.5px ${C.brassLine}` : undefined,
      }}
    >
      {showImage ? (
        <img src={url ?? ''} alt="" width={size} height={size} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

type Tone = 'brass' | 'green' | 'red' | 'neutral' | 'blue';
const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  brass: { fg: '#7C5F27', bg: C.brassBg, border: C.brassLine },
  green: { fg: C.green, bg: C.greenBg, border: C.greenLine },
  red: { fg: C.red, bg: C.redBg, border: C.redLine },
  neutral: { fg: C.muted, bg: C.sunken, border: C.lineStrong },
  blue: { fg: '#2F6B9A', bg: '#E5EFF8', border: '#BCD3E8' },
};

export function Chip({ label, tone = 'neutral', title }: { label: string; tone?: Tone; title?: string }) {
  const t = TONES[tone];
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, color: t.fg, background: t.bg, border: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

export function Button({
  label, onClick, variant = 'primary', loading = false, disabled = false, icon, style, type = 'button', title,
}: {
  label: string; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean;
  icon?: IconName; style?: CSSProperties; type?: 'button' | 'submit'; title?: string;
}) {
  const palette = {
    primary: { bg: C.ink, fg: C.bg, border: C.ink },
    secondary: { bg: '#fff', fg: C.ink, border: C.lineStrong },
    ghost: { bg: 'transparent', fg: C.muted, border: 'transparent' },
    danger: { bg: '#fff', fg: C.red, border: C.redLine },
  }[variant];
  const off = disabled || loading;
  return (
    <button
      type={type} title={title} onClick={onClick} disabled={off}
      className={variant === 'primary' ? 'ps-press' : 'ps-press ps-hover'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 16px',
        borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.bg, color: palette.fg,
        fontSize: 13, fontWeight: 500, cursor: off ? 'default' : 'pointer', opacity: off ? 0.55 : 1, whiteSpace: 'nowrap', ...style,
      }}
    >
      {loading ? <Spinner size={14} color={palette.fg} /> : icon ? <Icon name={icon} size={15} /> : null}
      {label}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: C.red, background: C.redBg, border: `1px solid ${C.redLine}`, borderRadius: 6, padding: '8px 12px' }}>{children}</p>;
}

export function EmptyState({ title, body, icon = 'info' }: { title: string; body?: string; icon?: IconName }) {
  return (
    <div style={{ padding: '56px 24px', textAlign: 'center', color: C.soft, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={26} color={C.faint} />
      <div style={{ fontSize: 14.5, fontWeight: 500, color: C.text }}>{title}</div>
      {body && <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 340 }}>{body}</div>}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 18, ...style }}>{children}</div>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header style={{ padding: '22px 28px 16px', borderBottom: `1px solid ${C.line}`, background: '#fff', flexShrink: 0 }}>
      <h1 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em', color: C.ink }}>{title}</h1>
      {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.soft }}>{subtitle}</p>}
      {children}
    </header>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.sunken, borderRadius: 8, padding: '0 11px', height: 36 }}>
      <Icon name="search" size={15} color={C.soft} />
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: C.ink, minWidth: 0 }}
      />
    </div>
  );
}
