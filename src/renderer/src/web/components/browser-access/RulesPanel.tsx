// components/browser-access/RulesPanel.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { Btn, ErrorText, Label } from './ui';
import type { Access } from './types';

// The Rules tab: what an agent using this access may do. Allowed sites (the only places its browser may open) and the owner's notes (shown to every agent
// together with the tool).

function normalizeHost(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '');
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(raw) ? raw : null;
}

function AllowedSites({ access, onUpdated }: { access: Access; onUpdated: (a: Access) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const primary = access.host.replace(/^www\./, '');
  const extra = access.allowed_hosts ?? [];

  const save = async (next: string[]) => {
    setSaving(true);
    setError('');
    const { error: updateError } = await createClient().from('browser_accesses').update({ allowed_hosts: next }).eq('id', access.id);
    setSaving(false);
    if (updateError) { setError('Could not save.'); return; }
    onUpdated({ ...access, allowed_hosts: next });
  };

  const add = async () => {
    const host = normalizeHost(value);
    if (!host) { setError('Enter a site like app.example.com'); return; }
    if (host === primary || extra.includes(host)) { setError('Already on the list.'); return; }
    if (extra.length >= 20) { setError('At most 20 extra sites.'); return; }
    setValue('');
    await save([...extra, host]);
  };

  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontFamily: MONO, border: `1px solid ${C.line}` };

  return (
    <section style={{ display: 'grid', gap: '0.6rem' }}>
      <Label hint="Agents using this access can only open pages on these sites (and their subdomains); anything else is blocked. Add a site only if the login or the work really moves there, for example a separate sign-in domain.">Allowed sites</Label>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span style={{ ...chip, background: C.surface, color: C.ink }} title="The login page's own site; always allowed"><Icon name="lock" size={11} />{primary}</span>
        {extra.map(h => (
          <span key={h} style={{ ...chip, background: '#fff', color: C.ink }}>
            {h}
            <button type="button" onClick={() => save(extra.filter(x => x !== h))} disabled={saving} aria-label={`Remove ${h}`} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', maxWidth: 420 }}>
        <input className="ba-field" value={value} placeholder="another-site.example.com" onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <Btn size="md" icon="plus" onClick={add} disabled={saving || !value.trim()}>Add</Btn>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </section>
  );
}

const NOTES_MAX = 2000;

function OwnerNotes({ access, onUpdated }: { access: Access; onUpdated: (a: Access) => void }) {
  const [value, setValue] = useState(access.owner_context ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = value.trim() !== (access.owner_context ?? '').trim();

  const save = async () => {
    setSaving(true);
    setError('');
    const next = value.trim() || null;
    const { error: updateError } = await createClient().from('browser_accesses').update({ owner_context: next }).eq('id', access.id);
    setSaving(false);
    if (updateError) { setError('Could not save.'); return; }
    onUpdated({ ...access, owner_context: next });
  };

  return (
    <section style={{ display: 'grid', gap: '0.5rem' }}>
      <Label hint={<>Shown to every agent together with this tool, like a tool&apos;s own description: what the site is for, rules to follow (&ldquo;never delete anything&rdquo;), and terms your team uses. What agents learn about how the site works goes in the Manual, not here.</>}>Your notes for agents</Label>
      <textarea
        className="ba-field" value={value} maxLength={NOTES_MAX} rows={4} onChange={e => setValue(e.target.value)} style={{ lineHeight: 1.55, resize: 'vertical' }}
        placeholder="e.g. This is our client's CRM. Only read data and create drafts; never send or delete."
      />
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <Btn variant="primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save notes'}</Btn>
        <span style={{ fontSize: '0.68rem', color: C.muted }}>{value.length}/{NOTES_MAX}</span>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </section>
  );
}

export function RulesPanel({ access, onUpdated }: { access: Access; onUpdated: (a: Access) => void }) {
  return (
    <div style={{ display: 'grid', gap: '1.3rem' }}>
      <AllowedSites access={access} onUpdated={onUpdated} />
      <div style={{ borderTop: `1px solid ${C.lineSoft}` }} />
      <OwnerNotes key={access.id} access={access} onUpdated={onUpdated} />
    </div>
  );
}
