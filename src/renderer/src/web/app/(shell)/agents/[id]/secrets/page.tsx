// app/agents/[id]/secrets/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { TabHeader, HeaderButton } from '@/components/agent-ui/TabHeader';
import { LocalCopyRow, LocalSaveChoice } from '@/components/local-copy/LocalCopy';

interface Secret {
  id:                string;
  name:              string;
  context:           string | null;
  created_at:        string;
  agent_importable:  boolean;
  allowed_hosts:     string[] | null;
  storage?:          string | null;
}

interface UserSecretDef {
  id:                string;
  name:              string;
  context:           string | null;
  required:          boolean;
  created_at:        string;
  agent_importable:  boolean;
  allowed_hosts:     string[] | null;
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Create secret modal ────────────────────────────────────────────────────────

function CreateSecretModal({ agentId, onClose, onCreated }: {
  agentId:   string;
  onClose:   () => void;
  onCreated: (s: Secret) => void;
}) {
  const [name, setName]       = useState('');
  const [context, setContext] = useState('');
  const [value, setValue]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const nameRef     = useRef<HTMLInputElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    const trimmedName = name.trim().toUpperCase();
    if (!trimmedName) { setError('Name is required.'); return; }
    if (!value.trim()) { setError('Value is required.'); return; }

    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, context: context.trim(), value }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok || !data.ok) { setError(data.error || 'Something went wrong.'); return; }

      onCreated({ id: crypto.randomUUID(), name: trimmedName, context: context.trim() || null, created_at: new Date().toISOString(), agent_importable: false, allowed_hosts: null });
    } catch {
      setLoading(false);
      setError('Network error. Please try again.');
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.15s ease both' }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 460, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              New secret
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
              Add a secret
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Name <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <input
              ref={nameRef} className="secret-input" type="text"
              placeholder="e.g. STRIPE_API_KEY"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              name="secret-name-field"
              data-1p-ignore
              data-lpignore="true"
              style={{ fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase' }}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0' }}>
              UPPER_SNAKE_CASE — this becomes the environment variable name the agent&apos;s code reads.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Context
            </label>
            <textarea
              className="secret-input"
              placeholder="What this secret is for, so the agent knows when to use it."
              value={context}
              onChange={e => setContext(e.target.value)}
              rows={2}
              autoComplete="off"
              style={{ resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Value <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <input
              className="secret-input" type="password"
              placeholder="••••••••••••"
              value={value}
              onChange={e => { setValue(e.target.value); setError(''); }}
              autoComplete="new-password"
              name="secret-value-field"
              data-1p-ignore
              data-lpignore="true"
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0' }}>
              Encrypted at rest. You won&apos;t be able to view this value again after saving — only replace or delete it.
            </p>
            <LocalSaveChoice kind="secret" agentId={agentId} />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim() || !value.trim()}
            style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: !name.trim() || !value.trim() ? 0.5 : 1 }}
          >
            {loading && <Spinner />}
            {loading ? 'Saving…' : 'Add secret'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create user-supplied key modal ─────────────────────────────────────────────
// Unlike CreateSecretModal, this writes directly to agent_user_secret_defs via
// the browser client (RLS-gated, owner/admin ALL policy) rather than a server
// route — there's no value to encrypt here, only a name/context definition,
// so there's nothing that needs bemain/Fernet in the loop.

function CreateUserKeyModal({ agentId, onClose, onCreated }: {
  agentId:   string;
  onClose:   () => void;
  onCreated: (d: UserSecretDef) => void;
}) {
  const [name, setName]       = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const nameRef     = useRef<HTMLInputElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    const trimmedName = name.trim().toUpperCase();
    if (!trimmedName) { setError('Name is required.'); return; }

    setLoading(true); setError('');
    try {
      const supabase = createClient();
      const { data, error: dbError } = await supabase
        .from('agent_user_secret_defs')
        .insert({ agent_id: agentId, name: trimmedName, context: context.trim() || null })
        .select()
        .single();

      setLoading(false);
      if (dbError || !data) {
        setError(dbError?.code === '23505' ? 'A key with this name already exists.' : (dbError?.message || 'Something went wrong.'));
        return;
      }
      onCreated(data as UserSecretDef);
    } catch {
      setLoading(false);
      setError('Network error. Please try again.');
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.15s ease both' }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 460, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              New user-supplied key
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
              Define a key name
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Name <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <input
              ref={nameRef} className="secret-input" type="text"
              placeholder="e.g. BINANCE_API_KEY"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              name="user-key-name-field"
              data-1p-ignore
              data-lpignore="true"
              style={{ fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase' }}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0' }}>
              UPPER_SNAKE_CASE — each connected user will supply their own value for this name from their My Keys tab.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Context
            </label>
            <textarea
              className="secret-input"
              placeholder="What this key is for, so users know what to provide."
              value={context}
              onChange={e => setContext(e.target.value)}
              rows={2}
              autoComplete="off"
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: !name.trim() ? 0.5 : 1 }}
          >
            {loading && <Spinner />}
            {loading ? 'Saving…' : 'Add key'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Importable toggle ──────────────────────────────────────────────────────────
// Whether the agent can pull this secret into its own arbitrary code_executor
// calls (via the secretless broker), vs. only ever being usable inside a
// Tool Builder custom tool the admin writes. Defaults to false (tool-builder
// only) at creation — this is the safer default; an admin opts a secret IN.
// Mutated via a direct RLS update (same pattern delete already uses), not a
// server route — this is metadata, never touches the encrypted value column.

function ImportableToggle({ table, id, agentImportable, allowedHosts, onUpdated }: {
  table:            'secrets' | 'agent_user_secret_defs';
  id:                string;
  agentImportable:   boolean;
  allowedHosts:      string[] | null;
  onUpdated:         (agentImportable: boolean, allowedHosts: string[] | null) => void;
}) {
  const [hostsInput, setHostsInput] = useState((allowedHosts ?? []).join(', '));
  const [saving, setSaving]         = useState(false);

  const toggle = async () => {
    const next = !agentImportable;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from(table).update({ agent_importable: next }).eq('id', id);
    setSaving(false);
    if (!error) onUpdated(next, allowedHosts);
  };

  const saveHosts = async () => {
    const hosts = hostsInput.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    const next = hosts.length ? hosts : null;
    if (JSON.stringify(next) === JSON.stringify(allowedHosts)) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from(table).update({ allowed_hosts: next }).eq('id', id);
    setSaving(false);
    if (!error) onUpdated(agentImportable, next);
  };

  return (
    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F0EEE4' }}>
      <button
        onClick={toggle}
        disabled={saving}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', padding: 0, fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.7rem', color: agentImportable ? '#7C5F27' : '#9E9C8F' }}
      >
        <span style={{ width: 28, height: 16, borderRadius: 8, background: agentImportable ? '#A17F3A' : '#DAD5C5', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: 2, left: agentImportable ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </span>
        {agentImportable ? 'Available to code_executor' : 'Tool-builder only'}
      </button>
      <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.4rem 0 0', lineHeight: 1.5 }}>
        {agentImportable
          ? 'The agent can request this directly in its own code via code_executor — only works for auth that uses the value as-is (a bearer token, an API-key header), never HMAC/signature or Basic-Auth schemes.'
          : 'Only usable inside a custom tool you build in Tool Builder — the agent never sees the raw value. Required for anything needing a computed signature (HMAC, AWS SigV4, etc).'}
      </p>
      {agentImportable && (
        <input
          className="secret-input"
          style={{ marginTop: '0.6rem', fontSize: '0.78rem', padding: '0.4rem 0.6rem' }}
          placeholder="Allowed hosts for /broker/relay, comma-separated, e.g. api.stripe.com"
          value={hostsInput}
          onChange={e => setHostsInput(e.target.value)}
          onBlur={saveHosts}
        />
      )}
    </div>
  );
}

// ─── Confirm delete modal ────────────────────────────────────────────────────────
// Shared between both delete flows below — no more one-click destructive deletes.

function ConfirmDeleteModal({ name, kind, deleting, onClose, onConfirm }: {
  name:      string;
  kind:      'secret' | 'user-supplied key';
  deleting:  boolean;
  onClose:   () => void;
  onConfirm: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current && !deleting) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#B34A3C', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
          This cannot be undone
        </p>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: '0 0 0.75rem' }}>
          Delete &ldquo;{name}&rdquo;?
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#67655A', lineHeight: 1.6, margin: 0 }}>
          {kind === 'secret'
            ? 'This removes the stored value permanently — the agent will no longer be able to use it, and it cannot be recovered.'
            : 'Connected users will no longer be asked for this key, and any value they already supplied for it is deleted along with this definition.'}
        </p>
        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={deleting}
            style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: deleting ? 'not-allowed' : 'pointer', borderRadius: 4 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{ background: '#B34A3C', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: deleting ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {deleting && <Spinner />}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SecretsPage() {
  const { agentId, agent } = useAgentCtx();
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Secret | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [userKeyDefs, setUserKeyDefs]       = useState<UserSecretDef[]>([]);
  const [keyModalOpen, setKeyModalOpen]     = useState(false);
  const [deleteDefTarget, setDeleteDefTarget] = useState<UserSecretDef | null>(null);
  const [deletingDefId, setDeletingDefId]   = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const [{ data: secretsData }, { data: defsData }] = await Promise.all([
        supabase.from('secrets').select('id, name, context, created_at, agent_importable, allowed_hosts, storage').eq('agent_id', agentId).order('name', { ascending: true }),
        supabase.from('agent_user_secret_defs').select('id, name, context, required, created_at, agent_importable, allowed_hosts').eq('agent_id', agentId).order('name', { ascending: true }),
      ]);
      setSecrets((secretsData as Secret[]) ?? []);
      setUserKeyDefs((defsData as UserSecretDef[]) ?? []);
      setLoading(false);
    })();
  }, [agentId]);

  const handleKeyDefCreated = (d: UserSecretDef) => {
    setUserKeyDefs(prev => [...prev, d].sort((a, b) => a.name.localeCompare(b.name)));
    setKeyModalOpen(false);
  };

  const handleConfirmDeleteDef = async () => {
    if (!deleteDefTarget) return;
    setDeletingDefId(deleteDefTarget.id);
    const supabase = createClient();
    const { error } = await supabase.from('agent_user_secret_defs').delete().eq('id', deleteDefTarget.id);
    setDeletingDefId(null);
    if (!error) {
      setUserKeyDefs(prev => prev.filter(d => d.id !== deleteDefTarget.id));
      setDeleteDefTarget(null);
    }
  };

  const handleCreated = (s: Secret) => {
    setSecrets(prev => {
      const withoutOld = prev.filter(p => p.name !== s.name); // upsert semantics on rename-collision
      return [...withoutOld, s].sort((a, b) => a.name.localeCompare(b.name));
    });
    setModalOpen(false);
  };

  const handleSecretUpdated = (id: string, agentImportable: boolean, allowedHosts: string[] | null) => {
    setSecrets(prev => prev.map(s => s.id === id ? { ...s, agent_importable: agentImportable, allowed_hosts: allowedHosts } : s));
  };

  const handleDefUpdated = (id: string, agentImportable: boolean, allowedHosts: string[] | null) => {
    setUserKeyDefs(prev => prev.map(d => d.id === id ? { ...d, agent_importable: agentImportable, allowed_hosts: allowedHosts } : d));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    const supabase = createClient();
    const { error } = await supabase.from('secrets').delete().eq('id', deleteTarget.id);
    setDeletingId(null);
    if (!error) {
      setSecrets(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner size={20} color="#26251E" />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader
          title="Credentials it can use."
          subtitle="API keys and credentials for the agent's code. Encrypted at rest; never shown again after saving."
          note={<>Every secret defaults to <strong>tool-builder only</strong>: usable inside a custom tool you build in Tool Builder, never visible to the agent&apos;s own live code. Flip a secret to &ldquo;Available to code_executor&rdquo; only for APIs that accept the value as-is (a bearer token, an API-key header). Anything needing a computed signature (HMAC, AWS SigV4, Basic Auth) has to stay tool-builder-only and be wired into a dedicated tool instead.</>}
          actions={<HeaderButton plus onClick={() => setModalOpen(true)}>New secret</HeaderButton>}
        />

        {secrets.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No secrets yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {secrets.map(s => (
              <div key={s.id} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.3rem' }}>
                      {s.name}
                      {s.storage === 'device_only' && <span style={{ marginLeft: '0.5rem', fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: '#EDEBE2', color: '#67655A', border: '1px solid #E2DFD3' }}>no value in the cloud</span>}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{s.context || 'No description.'}</p>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    disabled={deletingId === s.id}
                    style={{ background: 'none', border: '1px solid #E3C4BB', color: '#B34A3C', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4, flexShrink: 0 }}
                  >
                    {deletingId === s.id ? '…' : 'Delete'}
                  </button>
                </div>
                <ImportableToggle
                  table="secrets"
                  id={s.id}
                  agentImportable={s.agent_importable}
                  allowedHosts={s.allowed_hosts}
                  onUpdated={(ai, ah) => handleSecretUpdated(s.id, ai, ah)}
                />
                <LocalCopyRow kind="secret" agentId={agentId} name={s.name} />
              </div>
            ))}
          </div>
        )}

        {/* User-supplied keys — usable regardless of current visibility, so an
            admin can prepare required keys before switching an agent to
            private/public rather than being blocked until after (they're
            inert, and simply unused, until the agent is actually shared) */}
        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #E2DFD3' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '1rem' }}>
            <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.68rem', color: '#7C5F27', letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>
              User-supplied keys
            </p>
            <button
              onClick={() => setKeyModalOpen(true)}
              style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.4rem 0.85rem', fontSize: '0.76rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4, flexShrink: 0 }}
            >
              + Add key
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#67655A', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
            Key names connected users must supply their own value for — e.g. their own API key for a service this agent calls on their behalf. You define the name and context here; each connected user fills in their own value from their My Keys tab.
            {agent?.visibility === 'personal' && ' This agent is currently personal, so these won’t apply to anyone until you share it as private or public.'}
          </p>

          {userKeyDefs.length === 0 ? (
            <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No user-supplied keys defined.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {userKeyDefs.map(d => (
                <div key={d.id} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.3rem' }}>{d.name}</p>
                      <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{d.context || 'No description.'}</p>
                    </div>
                    <button
                      onClick={() => setDeleteDefTarget(d)}
                      disabled={deletingDefId === d.id}
                      style={{ background: 'none', border: '1px solid #E3C4BB', color: '#B34A3C', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4, flexShrink: 0 }}
                    >
                      {deletingDefId === d.id ? '…' : 'Delete'}
                    </button>
                  </div>
                  <ImportableToggle
                    table="agent_user_secret_defs"
                    id={d.id}
                    agentImportable={d.agent_importable}
                    allowedHosts={d.allowed_hosts}
                    onUpdated={(ai, ah) => handleDefUpdated(d.id, ai, ah)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .secret-input {
          width: 100%; padding: 0.55rem 0.7rem; font-size: 0.875rem;
          font-family: 'Inter', sans-serif; color: #26251E; background: #fff;
          border: 1px solid #DAD5C5; border-radius: 4px; outline: none;
          transition: border-color 0.15s; box-sizing: border-box; line-height: 1.55;
        }
        .secret-input:focus { border-color: #26251E; }
        .secret-input::placeholder { color: #B9B4A2; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {modalOpen && (
        <CreateSecretModal
          agentId={agentId}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {keyModalOpen && (
        <CreateUserKeyModal
          agentId={agentId}
          onClose={() => setKeyModalOpen(false)}
          onCreated={handleKeyDefCreated}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          name={deleteTarget.name}
          kind="secret"
          deleting={deletingId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {deleteDefTarget && (
        <ConfirmDeleteModal
          name={deleteDefTarget.name}
          kind="user-supplied key"
          deleting={deletingDefId === deleteDefTarget.id}
          onClose={() => setDeleteDefTarget(null)}
          onConfirm={handleConfirmDeleteDef}
        />
      )}
    </div>
  );
}
