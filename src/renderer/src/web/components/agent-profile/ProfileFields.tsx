// components/agent-profile/ProfileFields.tsx
'use client';

import { C, MONO } from '@/components/account/tokens';

/** A labelled text field or textarea, with an optional hint and a character counter when it has a limit. */
export function Field({ id, label, value, onChange, placeholder, hint, rows, maxLength }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; rows?: number; maxLength?: number;
}) {
  return (
    <div style={{ marginBottom: '1.15rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: hint ? '0.2rem' : '0.4rem' }}>
        <label htmlFor={id} style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.body, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</label>
        {maxLength && <span style={{ fontFamily: MONO, fontSize: '0.62rem', color: value.length >= maxLength ? C.amber : C.muted }}>{value.length}/{maxLength}</span>}
      </div>
      {hint && <p style={{ fontSize: '0.74rem', color: C.muted, margin: '0 0 0.45rem', lineHeight: 1.55 }}>{hint}</p>}
      {rows
        ? <textarea id={id} className="ap-field" rows={rows} placeholder={placeholder} maxLength={maxLength} value={value} onChange={e => onChange(e.target.value)} style={{ resize: 'vertical' }} />
        : <input id={id} className="ap-field" type="text" placeholder={placeholder} maxLength={maxLength} value={value} onChange={e => onChange(e.target.value)} />}
    </div>
  );
}

/** An on/off switch exposed to assistive tech as a switch, with the label it controls. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: checked ? C.ink : '#DAD5C5', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  );
}

export const PROFILE_FIELD_CSS = `
  .ap-field { width: 100%; padding: 0.6rem 0.75rem; font-size: 0.875rem; font-family: 'Inter', sans-serif; color: ${C.ink}; background: #fff;
    border: 1px solid #DAD5C5; border-radius: 6px; outline: none; transition: border-color 0.15s, box-shadow 0.15s; box-sizing: border-box; line-height: 1.55; }
  .ap-field:focus { border-color: ${C.ink}; box-shadow: 0 0 0 3px rgba(161,127,58,0.14); }
  .ap-field::placeholder { color: ${C.faint}; }
  .ap-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 1.25rem; align-items: start; }
  .ap-side { position: sticky; top: 1rem; }
  @media (max-width: 1000px) { .ap-grid { grid-template-columns: minmax(0, 1fr); } .ap-side { position: static; } }
`;
