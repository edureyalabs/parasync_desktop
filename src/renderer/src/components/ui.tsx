// src/renderer/src/components/ui.tsx
// The few controls the desktop's own screens (sign-in, update notice) need. Everything else comes from the web's own components.
import type { CSSProperties } from 'react';

const INK = '#26251E';
const BRASS = '#A17F3A';
const LINE_STRONG = '#DAD5C5';
const RED = '#B34A3C';

export function Spinner({ size = 18, color = BRASS }: { size?: number; color?: string }) {
  return (
    <svg className="ps-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  label, onClick, variant = 'primary', loading = false, disabled = false, style, type = 'button',
}: {
  label: string; onClick?: () => void; variant?: 'primary' | 'secondary'; loading?: boolean; disabled?: boolean; style?: CSSProperties; type?: 'button' | 'submit';
}) {
  const palette = variant === 'primary' ? { bg: INK, fg: '#F7F6F2', border: INK } : { bg: '#fff', fg: INK, border: LINE_STRONG };
  const off = disabled || loading;
  return (
    <button
      type={type} onClick={onClick} disabled={off} className="ps-press"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 36, padding: '0 16px', borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.bg, color: palette.fg, fontSize: 13, fontWeight: 500, cursor: off ? 'default' : 'pointer', opacity: off ? 0.55 : 1, whiteSpace: 'nowrap', ...style }}
    >
      {loading && <Spinner size={14} color={palette.fg} />}
      {label}
    </button>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: RED, background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 6, padding: '8px 12px' }}>{children}</p>;
}
