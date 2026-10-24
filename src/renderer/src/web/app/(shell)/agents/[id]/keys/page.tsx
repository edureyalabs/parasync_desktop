// app/agents/[id]/keys/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { TabHeader } from '@/components/agent-ui/TabHeader';

interface KeyDef {
  id:       string;
  name:     string;
  context:  string | null;
  required: boolean;
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Set value modal ────────────────────────────────────────────────────────────
// Same shape as the admin Secrets tab's CreateSecretModal, so both tabs read as
// one consistent pattern — a single focused field in a modal, not an
// always-visible inline input+button sitting inside every row.

function SetKeyValueModal({ agentId, def, hasValue, onClose, onSaved }: {
  agentId:  string;
  def:      KeyDef;
  hasValue: boolean;
  onClose:  () => void;
  onSaved:  (name: string) => void;
}) {
  const [value, setValue]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const valueRef    = useRef<HTMLInputElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    valueRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    if (!value.trim()) { setError('Enter a value.'); return; }

    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/user-secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: def.name, value: value.trim() }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok || !data.ok) { setError(data.error || 'Something went wrong.'); return; }
      onSaved(def.name);
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
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 440, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              {hasValue ? 'Update value' : 'Set value'}
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
              {def.name}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {def.context && (
          <p style={{ fontSize: '0.8rem', color: '#67655A', margin: '0 0 1.1rem', lineHeight: 1.6 }}>{def.context}</p>
        )}

        <div>
          <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            Value <span style={{ color: '#B34A3C' }}>*</span>
          </label>
          <input
            ref={valueRef}
            className="key-input" type="password"
            placeholder={hasValue ? 'Replace saved value…' : '••••••••••••'}
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            autoComplete="new-password"
            name="user-secret-value-field"
            data-1p-ignore
            data-lpignore="true"
          />
          <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0' }}>
            Encrypted at rest. Only you can see or change this — the agent&apos;s creator never sees the value.
          </p>
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
            disabled={loading || !value.trim()}
            style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: !value.trim() ? 0.5 : 1 }}
          >
            {loading && <Spinner />}
            {loading ? 'Saving…' : hasValue ? 'Update value' : 'Save value'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KeysPage() {
  const { agentId } = useAgentCtx();
  const [defs, setDefs] = useState<KeyDef[]>([]);
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editingDef, setEditingDef] = useState<KeyDef | null>(null);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const [{ data: defsData }, { data: existing }] = await Promise.all([
        supabase.from('agent_user_secret_defs').select('id, name, context, required').eq('agent_id', agentId).order('name', { ascending: true }),
        session ? supabase.from('agent_user_secrets').select('name').eq('agent_id', agentId).eq('user_id', session.user.id) : Promise.resolve({ data: [] }),
      ]);
      setDefs((defsData as KeyDef[]) ?? []);
      setSavedNames(new Set((existing ?? []).map((r: { name: string }) => r.name)));
      setLoading(false);
    })();
  }, [agentId]);

  const handleSaved = (name: string) => {
    setSavedNames(prev => new Set(prev).add(name));
    setEditingDef(null);
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
        <TabHeader title="Your own credentials." subtitle="Credentials this agent needs from you. Encrypted at rest; only you can see or change them." />

        {defs.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>This agent doesn&apos;t require any keys from you.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {defs.map(d => {
              const saved = savedNames.has(d.name);
              return (
                <div key={d.id} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: 0 }}>
                        {d.name}{d.required && <span style={{ color: '#B34A3C' }}> *</span>}
                      </p>
                      <span style={{
                        fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3,
                        background: saved ? '#E6F1EC' : '#EDEBE2', color: saved ? '#3C7E6A' : '#9E9C8F',
                        border: `1px solid ${saved ? '#BFE0D6' : '#E2DFD3'}`,
                      }}>
                        {saved ? 'saved' : 'not set'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{d.context || 'No description.'}</p>
                  </div>
                  <button
                    onClick={() => setEditingDef(d)}
                    style={{ background: saved ? 'none' : '#26251E', border: saved ? '1px solid #DAD5C5' : 'none', color: saved ? '#3A3830' : '#F7F6F2', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4, flexShrink: 0 }}
                  >
                    {saved ? 'Update' : 'Set value'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .key-input {
          width: 100%; padding: 0.55rem 0.7rem; font-size: 0.875rem;
          font-family: 'Inter', sans-serif; color: #26251E; background: #fff;
          border: 1px solid #DAD5C5; border-radius: 4px; outline: none;
          transition: border-color 0.15s; box-sizing: border-box; line-height: 1.55;
        }
        .key-input:focus { border-color: #26251E; }
        .key-input::placeholder { color: #B9B4A2; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {editingDef && (
        <SetKeyValueModal
          agentId={agentId}
          def={editingDef}
          hasValue={savedNames.has(editingDef.name)}
          onClose={() => setEditingDef(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
