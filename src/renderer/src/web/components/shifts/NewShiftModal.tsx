// components/shifts/NewShiftModal.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { allTimezones, browserTimezone } from '@/lib/timezones';
import { BG, INK, LINE, MONO, MUTED, RED, RED_BG, RED_LINE, SANS, SOFT } from './tokens';
import type { Shift } from './types';

// The three things a shift is made from: a name (to recognise it), the definition (how the job is
// done: when it runs, the tools, the rules, the time limits), and what the end-of-shift report must
// say. Everything else (window, wake times, the operating brief) is worked out by the shift planner.
// Times in the definition are read in the ORGANIZATION's timezone, so the modal asks for it once if
// the organization has none yet.

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${LINE}`, borderRadius: 4, padding: '0.6rem 0.75rem',
  fontSize: '0.85rem', fontFamily: SANS, color: INK, background: '#fff', outline: 'none',
};
const labelStyle: React.CSSProperties = { fontFamily: MONO, fontSize: '0.68rem', color: SOFT, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', margin: '0 0 0.35rem' };

export default function NewShiftModal({ agentId, orgId, userId, onClose, onCreated }: {
  agentId: string;
  orgId: string;
  userId: string;
  onClose: () => void;
  onCreated: (shift: Shift) => void;
}) {
  const [name, setName] = useState('');
  const [definition, setDefinition] = useState('');
  const [report, setReport] = useState('');
  const [orgZone, setOrgZone] = useState<string | null | undefined>(undefined);   // undefined = still loading
  const [pickedZone, setPickedZone] = useState(browserTimezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overlay = useRef<HTMLDivElement>(null);
  const zones = useMemo(() => allTimezones(), []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient().from('organizations').select('timezone').eq('id', orgId).maybeSingle();
      if (!cancelled) setOrgZone((data as { timezone: string | null } | null)?.timezone ?? null);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const needsZone = orgZone === null;
  const ready = name.trim().length > 0 && definition.trim().length > 0 && orgZone !== undefined;

  const submit = async () => {
    setError('');
    if (!ready) return;
    setBusy(true);
    const supabase = createClient();

    if (needsZone) {
      const { error: zoneError } = await supabase.from('organizations').update({ timezone: pickedZone }).eq('id', orgId);
      if (zoneError) { setBusy(false); setError('Could not save the organization timezone. Please try again.'); return; }
    }

    const { data, error: dbError } = await supabase
      .from('shifts')
      .insert({
        agent_id: agentId, org_id: orgId, created_by: userId,
        name: name.trim(), definition: definition.trim(), report_instructions: report.trim() || null,
      })
      .select()
      .single();
    if (dbError || !data) { setBusy(false); setError('Something went wrong creating the shift. Please try again.'); return; }

    // Start planning now; bemain's sweep would pick it up anyway, this just makes it immediate.
    void fetch('/api/shifts/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shift_id: (data as Shift).id }) }).catch(() => undefined);
    setBusy(false);
    onCreated(data as Shift);
  };

  return (
    <div
      ref={overlay}
      onClick={e => { if (e.target === overlay.current && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div role="dialog" aria-modal="true" aria-label="New shift" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '1.9rem', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.4rem' }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: '0.68rem', color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>New shift</p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: INK, margin: 0 }}>A standing job for this agent</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: SOFT, padding: 2, lineHeight: 1, marginLeft: '1rem' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={labelStyle} htmlFor="shift-name">Name</label>
            <input id="shift-name" style={inputStyle} value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="Store inventory & procurement" />
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: MUTED }}>Only for you: it helps you recognise the shift in the list.</p>
          </div>

          <div>
            <label style={labelStyle} htmlFor="shift-definition">Definition</label>
            <textarea
              id="shift-definition" style={{ ...inputStyle, minHeight: 180, resize: 'vertical', lineHeight: 1.55 }} value={definition}
              onChange={e => setDefinition(e.target.value)}
              placeholder={'Describe the job in your own words. Include when it runs (e.g. 10am to 6pm), what the agent does, which tools to use, the rules and the time limits to follow.\n\nFor example: "From 10am to 6pm, check the store inventory every 30 minutes with stock_check. For every item below its threshold raise a procurement ticket with procurement_call. If a ticket is not dispatched 20 minutes after raising, ask for an update. Once a ticket reaches the store, make sure it is inwarded within 10 minutes."'}
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="shift-report">End-of-shift report <span style={{ textTransform: 'none', letterSpacing: 0, color: MUTED }}>(optional)</span></label>
            <textarea
              id="shift-report" style={{ ...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.55 }} value={report}
              onChange={e => setReport(e.target.value)}
              placeholder="What should the final report say? e.g. every ticket raised with its final status, items still open, anything that needs a person."
            />
          </div>

          {needsZone && (
            <div style={{ background: '#F3EDDA', border: '1px solid #E4D2A0', borderRadius: 6, padding: '0.85rem 1rem' }}>
              <label style={{ ...labelStyle, color: '#7C5F27' }} htmlFor="shift-zone">Your organization&apos;s timezone</label>
              <select id="shift-zone" style={inputStyle} value={pickedZone} onChange={e => setPickedZone(e.target.value)}>
                {!zones.includes(pickedZone) && <option value={pickedZone}>{pickedZone}</option>}
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.74rem', color: SOFT, lineHeight: 1.5 }}>
                Times in a shift (&ldquo;10am to 6pm&rdquo;) are read in this timezone. It is saved on your organization and used for every shift.
              </p>
            </div>
          )}
        </div>

        {error && <p style={{ fontSize: '0.8rem', color: RED, margin: '1rem 0 0', background: RED_BG, border: `1px solid ${RED_LINE}`, borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.6rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: SANS, cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
          <button
            onClick={submit} disabled={busy || !ready}
            style={{ background: INK, color: BG, border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: SANS, cursor: busy || !ready ? 'not-allowed' : 'pointer', borderRadius: 4, opacity: !ready ? 0.5 : 1 }}
          >
            {busy ? 'Creating…' : 'Create shift'}
          </button>
        </div>
      </div>
    </div>
  );
}
