// src/renderer/src/components/agent/kit.tsx
// The small building blocks every agent tab and account page is made of, so they all look and behave alike.
import type { CSSProperties, ReactNode } from 'react';

import { APP_CONFIG } from '@shared/config';

import { Icon } from '@/components/Icon';
import { Button, Center, Chip, ErrorText, Spinner } from '@/components/ui';
import type { AsyncState } from '@/hooks/useAsync';
import { C, MONO } from '@/lib/theme';

export function openWeb(path: string): void {
  void window.parasync.openExternal(`${APP_CONFIG.webUrl}${path}`).catch(() => undefined);
}

/** A white card with a title, for one group of information. */
export function Panel({ title, subtitle, action, children, style }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', ...style }}>
      {(title || action) && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.muted }}>{title}</h2>}
            {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: C.soft, lineHeight: 1.5 }}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** One line in a list: a main text, a smaller one under it, and anything on the right. */
export function Row({ primary, secondary, right, leading, last = false, onClick }: { primary: ReactNode; secondary?: ReactNode; right?: ReactNode; leading?: ReactNode; last?: boolean; onClick?: () => void }) {
  const body = (
    <>
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: C.ink, overflowWrap: 'anywhere' }}>{primary}</span>
        {secondary && <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.5, color: C.soft, overflowWrap: 'anywhere' }}>{secondary}</span>}
      </span>
      {right && <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{right}</span>}
    </>
  );
  const style: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: last ? 'none' : `1px solid ${C.line}`, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottomStyle: 'solid', borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line };
  return onClick
    ? <button onClick={onClick} className="ps-hover" style={{ ...style, cursor: 'pointer' }}>{body}</button>
    : <div style={style}>{body}</div>;
}

/** A label and its value, for facts about one thing. */
export function Fact({ label, value, last = false }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '10px 18px', borderBottom: last ? 'none' : `1px solid ${C.line}`, fontSize: 13.5 }}>
      <span style={{ color: C.soft, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.ink, textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}>{value}</span>
    </div>
  );
}

export function OnOff({ on, label }: { on: boolean; label?: string }) {
  return <Chip label={label ?? (on ? 'On' : 'Off')} tone={on ? 'green' : 'neutral'} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 13, color: C.soft, lineHeight: 1.6 }}>{children}</div>;
}

/** Shows a spinner while loading and a retry card on failure; otherwise the tab's content. */
export function Loaded<T>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  if (state.loading && state.data === null) return <Center><Spinner size={24} /></Center>;
  if (state.error && state.data === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', maxWidth: 480 }}>
        <ErrorText>{state.error}</ErrorText>
        <Button variant="secondary" icon="refresh" label="Try again" onClick={state.reload} />
      </div>
    );
  }
  if (state.data === null) return null;
  return <>{children(state.data)}</>;
}

/** The standard note on screens that only show things: where to change them. */
export function WebNote({ children, path, label = 'Open in the web app' }: { children: ReactNode; path: string; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: C.brassBg, border: `1px solid ${C.brassLine}`, borderRadius: 10, fontSize: 13, color: C.brassDeep, lineHeight: 1.5 }}>
      <Icon name="info" size={17} color={C.brass} />
      <span style={{ flex: 1 }}>{children}</span>
      <Button variant="secondary" icon="external" label={label} onClick={() => openWeb(path)} />
    </div>
  );
}

export const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };

export function shortDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

export function dateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

/** The frame of one settings tab: a heading, then its panels in a column. */
export function TabPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
      <header style={{ padding: '22px 28px 16px', borderBottom: `1px solid ${C.line}`, background: '#fff', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em', color: C.ink }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.soft, lineHeight: 1.5, maxWidth: 720 }}>{subtitle}</p>}
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      </div>
    </div>
  );
}
