// app/(shell)/account/usage/Filters.tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { C, MONO } from '@/components/account/tokens';
import { monthLabel, type RangePreset } from './model';

// The filter controls for the Usage tab. Plain controls styled to match the app (not chart
// marks): a segmented switch, and popovers that open a list of choices. They sit in ONE row
// above the charts and scope everything below.

// ─── Segmented switch ───────────────────────────────────────────────────────

export interface SegOption<T extends string> { value: T; label: ReactNode; disabled?: boolean; title?: string }

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: {
  value: T; options: SegOption<T>[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', background: '#EFEDE3', border: `1px solid ${C.line}`, borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value} role="radio" aria-checked={active} disabled={o.disabled} title={o.title}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none', borderRadius: 6, cursor: o.disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              padding: size === 'sm' ? '0.28rem 0.6rem' : '0.36rem 0.8rem', fontSize: size === 'sm' ? '0.72rem' : '0.78rem',
              fontFamily: "'Inter', sans-serif", fontWeight: active ? 500 : 400,
              background: active ? '#fff' : 'transparent', color: active ? C.ink : o.disabled ? C.faint : C.soft,
              boxShadow: active ? '0 1px 2px rgba(38,37,30,0.12), 0 0 0 1px rgba(38,37,30,0.04)' : 'none',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Popover ────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
      <path d="M2 3.6 5 6.6 8 3.6" />
    </svg>
  );
}

function Popover({ caption, summary, children, width = 260, align = 'left' }: {
  caption: string; summary: ReactNode; children: (close: () => void) => ReactNode; width?: number; align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', background: open ? C.surface : '#fff', border: `1px solid ${open ? '#C9C4B2' : '#DAD5C5'}`, borderRadius: 8, padding: '0.4rem 0.75rem', cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'border-color 0.12s, background 0.12s' }}
      >
        <span style={{ fontFamily: MONO, fontSize: '0.58rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{caption}</span>
        <span style={{ fontSize: '0.8rem', color: C.ink, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>{summary}</span>
        <span style={{ color: C.muted, display: 'flex' }}><Chevron open={open} /></span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, width, maxWidth: 'calc(100vw - 2rem)', zIndex: 30, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 10px 32px rgba(38,37,30,0.14)', overflow: 'hidden' }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 7.4 5.6 10.5 11.5 3.8" /></svg>
  );
}

const optionStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
  background: 'transparent', padding: '0.5rem 0.9rem', fontSize: '0.8rem', fontFamily: "'Inter', sans-serif",
  color: C.ink, fontWeight: active ? 500 : 400,
});

// ─── Date range ─────────────────────────────────────────────────────────────

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'last12m', label: 'Last 12 months' },
];

export function DateRangeMenu({ preset, rangeLabel, months, onChange }: {
  preset: RangePreset; rangeLabel: string; months: string[]; onChange: (p: RangePreset) => void;
}) {
  return (
    <Popover caption="Period" summary={rangeLabel} width={250}>
      {close => (
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {PRESETS.map(p => (
            <button key={p.value} className="ac-row" role="option" aria-selected={preset === p.value} onClick={() => { onChange(p.value); close(); }} style={optionStyle(preset === p.value)}>
              <span style={{ width: 16, display: 'flex' }}>{preset === p.value && <Check />}</span>{p.label}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${C.line}`, margin: '0.3rem 0 0', padding: '0.55rem 0.9rem 0.25rem', fontFamily: MONO, fontSize: '0.58rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>By month</div>
          {months.map(m => {
            const value = `m:${m}`;
            return (
              <button key={m} className="ac-row" role="option" aria-selected={preset === value} onClick={() => { onChange(value); close(); }} style={optionStyle(preset === value)}>
                <span style={{ width: 16, display: 'flex' }}>{preset === value && <Check />}</span>{monthLabel(m)}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

// ─── Multi-select (agents, sources) ─────────────────────────────────────────

export interface MultiOption { id: string; label: string; color?: string; hint?: string }

export function MultiSelect({ caption, noun, options, selected, onChange }: {
  caption: string;
  /** "agent" -> "All agents", "3 of 7 agents". */
  noun: string;
  options: MultiOption[];
  /** null = everything. */
  selected: ReadonlySet<string> | null;
  onChange: (next: ReadonlySet<string> | null) => void;
}) {
  const allIds = options.map(o => o.id);
  const isOn = (id: string) => selected === null || selected.has(id);
  const count = selected === null ? options.length : options.filter(o => selected.has(o.id)).length;

  const toggle = (id: string) => {
    const current = new Set(selected ?? allIds);
    if (current.has(id)) current.delete(id); else current.add(id);
    if (current.size === 0) return;                       // keep at least one: an empty chart explains nothing
    onChange(current.size === allIds.length ? null : current);
  };

  const summary: ReactNode =
    selected === null ? `All ${noun}s`
    : count === 1 ? (options.find(o => selected.has(o.id))?.label ?? `1 ${noun}`)
    : `${count} of ${options.length} ${noun}s`;

  return (
    <Popover caption={caption} summary={summary} width={290}>
      {() => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.9rem', borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{count} of {options.length} shown</span>
            <button onClick={() => onChange(null)} disabled={selected === null} style={{ background: 'none', border: 'none', cursor: selected === null ? 'default' : 'pointer', color: selected === null ? C.faint : C.brassDeep, fontSize: '0.74rem', padding: 0, fontFamily: "'Inter', sans-serif" }}>Select all</button>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {options.map(o => (
              <div key={o.id} className="ac-row" style={{ display: 'flex', alignItems: 'center' }}>
                <button role="checkbox" aria-checked={isOn(o.id)} onClick={() => toggle(o.id)} style={{ ...optionStyle(isOn(o.id)), flex: 1, minWidth: 0 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${isOn(o.id) ? C.ink : '#C9C4B2'}`, background: isOn(o.id) ? C.ink : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isOn(o.id) && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 7.4 5.6 10.5 11.5 3.8" /></svg>}
                  </span>
                  {o.color && <span style={{ width: 9, height: 9, borderRadius: 2, background: o.color, flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{o.label}</span>
                  {o.hint && <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, flexShrink: 0 }}>{o.hint}</span>}
                </button>
                <button onClick={() => onChange(new Set([o.id]))} title={`Show only ${o.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.68rem', padding: '0 0.9rem 0 0.2rem', fontFamily: "'Inter', sans-serif" }}>only</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
