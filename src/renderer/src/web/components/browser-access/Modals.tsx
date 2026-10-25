// components/browser-access/Modals.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons/Icon';
import { C } from '@/components/account/tokens';
import { Btn, ErrorText, Modal, Spinner, formLabel, post } from './ui';
import { ACCESS_COLUMNS, type Access } from './types';
import { LocalSaveChoice } from '@/components/local-copy/LocalCopy';

function slugify(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return /^[a-z]/.test(s) ? s : `site_${s}`.slice(0, 40);
}

// ─── Add a site ───────────────────────────────────────────────────────────────

export function AddModal({ agentId, onClose, onCreated }: { agentId: string; onClose: () => void; onCreated: (a: Access) => void }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setError('Enter the full login page address, starting with https://');
      return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') { setError('The address must start with https://'); return; }
    if (!label.trim()) { setError('Give this access a name.'); return; }
    setSaving(true);
    setError('');
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: agent } = await supabase.from('agents').select('org_id').eq('id', agentId).single();
    if (!userData.user || !agent) { setError('Could not load your account.'); setSaving(false); return; }
    const { data, error: insertError } = await supabase.from('browser_accesses').insert({
      org_id: agent.org_id, agent_id: agentId, created_by: userData.user.id,
      name: slugify(label), label: label.trim(), login_url: parsed.toString(), host: parsed.hostname.toLowerCase(),
    }).select(ACCESS_COLUMNS).single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.code === '23505' ? 'An access with that name already exists on this agent.' : 'Could not create it.');
      return;
    }
    onCreated(data as Access);
    onClose();
  };

  return (
    <Modal title="Add browser access" subtitle="A website this agent may sign in to." icon="globe" onClose={onClose}>
      <div style={{ display: 'grid', gap: '0.95rem' }}>
        <div>
          <label style={formLabel}>Name</label>
          <input className="ba-field" value={label} onChange={e => setLabel(e.target.value)} placeholder="Acme CRM" autoFocus />
        </div>
        <div>
          <label style={formLabel}>Login page address</label>
          <input className="ba-field" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://app.example.com/login" onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        </div>
        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', padding: '0.65rem 0.8rem', background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <span style={{ color: C.brassDeep, marginTop: 1 }}><Icon name="lock" size={14} /></span>
          <p style={{ fontSize: '0.74rem', color: C.soft, margin: 0, lineHeight: 1.55 }}>
            Next, press <strong>Start setup</strong>. An assistant reads the login page and asks you for the details in a secure form (it never sees them). Use a dedicated account with only the access the agent needs.
          </p>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Btn size="md" onClick={onClose}>Cancel</Btn>
          <Btn size="md" variant="primary" onClick={submit} disabled={saving}>{saving && <Spinner size={12} color="#fff" />}{saving ? 'Adding…' : 'Add access'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Sign-in details (built from the fields the setup assistant found) ───────────

export function CredentialsModal({ agentId, access, onClose }: { agentId: string; access: Access; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    const result = await post(`/api/agents/${agentId}/browser-access/${access.id}/credentials`, { values });
    setSaving(false);
    if (!result.ok) { setError(result.error || 'Could not save.'); return; }
    setValues({});
    onClose();
  };

  return (
    <Modal title="Sign-in details" subtitle={access.label || access.name} icon="key-round" onClose={onClose}>
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', padding: '0.65rem 0.8rem', background: C.greenWash, border: `1px solid ${C.greenLine}`, borderRadius: 10 }}>
          <span style={{ color: C.green, marginTop: 1 }}><Icon name="shield-check" size={14} /></span>
          <p style={{ fontSize: '0.74rem', color: C.body, margin: 0, lineHeight: 1.55 }}>
            Stored encrypted and typed into the site by the platform only. The assistant and your agents never see these values. Leave a field blank to keep what is already saved.
          </p>
        </div>
        {access.fields.map(f => (
          <div key={f.key}>
            {f.kind === 'checkbox' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: C.ink, cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: C.ink }} checked={values[f.key] === 'true'} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.checked ? 'true' : 'false' }))} />
                {f.label}
              </label>
            ) : (
              <>
                <label style={formLabel}>{f.label}</label>
                {f.kind === 'select' ? (
                  <select className="ba-field" value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}>
                    <option value="">Choose…</option>
                    {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="ba-field" type={f.kind === 'password' || f.secret ? 'password' : 'text'} autoComplete="off"
                    value={values[f.key] ?? ''} placeholder={f.kind === 'totp' ? 'Authenticator setup key (not the 6-digit code)' : undefined}
                    onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
              </>
            )}
          </div>
        ))}
        <LocalSaveChoice kind="browser_access" agentId={agentId} />
        {error && <ErrorText>{error}</ErrorText>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Btn size="md" onClick={onClose}>Cancel</Btn>
          <Btn size="md" variant="primary" icon={saving ? undefined : 'lock'} onClick={submit} disabled={saving}>{saving && <Spinner size={12} color="#fff" />}{saving ? 'Saving…' : 'Save securely'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
