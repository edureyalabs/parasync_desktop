// app/agents/[id]/signed-apis/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { EnableToggles } from '@/components/EnableToggles';
import { TabHeader } from '@/components/agent-ui/TabHeader';
import { ComingSoon } from '@/components/agent-header/ComingSoon';

interface FieldSchema {
  name:        string;
  label:       string;
  required:    boolean;
  secret:      boolean;
  placeholder: string;
  help:        string;
}

interface ActionSchema {
  name:        string;
  description: string;
}

interface ProviderCatalogEntry {
  key:         string;
  name:        string;
  description: string;
  fields:      FieldSchema[];
  actions:     ActionSchema[];
}

interface CredentialRow {
  provider_key: string;
  fields:       Record<string, string>;   // ciphertext — only field NAMES are meaningful here
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// Static files at /public/icons/{key}.svg — matches the provider_key exactly
// (aws, snowflake, bigquery, azure_storage, s3_compatible), same convention
// connectors/page.tsx's ConnectorIcon already established. Swap either file
// for an official brand asset any time without touching this component.
function ProviderIcon({ providerKey, name }: { providerKey: string; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local static SVGs, no static import list needed
    <img src={`/icons/${providerKey}.svg`} alt={name} width={24} height={24} style={{ flexShrink: 0, borderRadius: 4 }} />
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.65rem', fontSize: '0.82rem', fontFamily: "'Inter',sans-serif",
  border: '1px solid #DAD5C5', borderRadius: 4, color: '#26251E', background: '#fff',
};

// ─── Data loading shared by both roles ────────────────────────────────────────

function useSignedApiData(agentId: string) {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<Record<string, CredentialRow>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const reloadCredentials = async (userId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('agent_signed_api_credentials')
      .select('provider_key, fields')
      .eq('agent_id', agentId)
      .eq('user_id', userId);
    const map: Record<string, CredentialRow> = {};
    for (const row of (data as CredentialRow[]) ?? []) map[row.provider_key] = row;
    setCredentials(map);
  };

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const catalogRes = await fetch('/api/signed-apis').then(r => r.json()).catch(() => ({ providers: [], error: 'Network error.' }));
      if (catalogRes.error) setLoadError(catalogRes.error);
      setCatalog((catalogRes.providers as ProviderCatalogEntry[]) ?? []);

      if (session) await reloadCredentials(session.user.id);
      setLoading(false);
    })();
  }, [agentId]);

  return { catalog, credentials, loading, loadError, reloadCredentials };
}

// ─── Credential form — shared by both roles, one per enabled provider ─────────

function CredentialForm({ agentId, provider, credential, onSaved }: {
  agentId:    string;
  provider:   ProviderCatalogEntry;
  credential: CredentialRow | null;
  onSaved:    () => void;
}) {
  const [values, setValues]   = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [saved, setSaved]     = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const setValues_ = (name: string, v: string) => setValues(prev => ({ ...prev, [name]: v }));

  const filledFields = new Set(Object.keys(credential?.fields ?? {}));
  const missingRequired = provider.fields.filter(f => f.required && !filledFields.has(f.name));
  const isConfigured = filledFields.size > 0 && missingRequired.length === 0;

  // Collapsed by default once every required field is already set — nothing
  // left to fill in, so the raw field grid (mostly masked password inputs
  // anyway) is just noise until the user explicitly wants to change
  // something. Still expanded by default for a fresh/incomplete connection,
  // since that's exactly when the fields need attention.
  const [expanded, setExpanded] = useState(!isConfigured);

  const handleSave = async () => {
    const toSubmit = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
    if (Object.keys(toSubmit).length === 0) return;
    setSaving(true);
    setError('');
    setSaved(false);
    const res = await fetch(`/api/agents/${agentId}/signed-apis/${provider.key}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toSubmit }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok || !data.ok) {
      setError(data.error || 'Could not save these credentials.');
      return;
    }
    setValues({});
    setSaved(true);
    setExpanded(false);
    onSaved();
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    const supabase = createClient();
    await supabase
      .from('agent_signed_api_credentials')
      .delete()
      .eq('agent_id', agentId)
      .eq('provider_key', provider.key);
    setDisconnecting(false);
    onSaved();
  };

  return (
    <div style={{ borderTop: '1px solid #EDEBE2', paddingTop: '0.85rem', marginTop: '0.1rem' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (expanded || filledFields.size === 0) ? '0.6rem' : 0, cursor: filledFields.size > 0 ? 'pointer' : 'default' }}
        onClick={() => { if (filledFields.size > 0) setExpanded(e => !e); }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {filledFields.size > 0 && (
            <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: '0.7rem', color: '#9E9C8F' }}>
              ▶
            </span>
          )}
          <p style={{ fontSize: '0.75rem', color: '#9E9C8F', margin: 0 }}>Your own connection, for this agent</p>
        </div>
        {filledFields.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: missingRequired.length ? '#EFE4C9' : '#E6F1EC', color: missingRequired.length ? '#A17F3A' : '#3C7E6A', border: `1px solid ${missingRequired.length ? '#E4D2A0' : '#BFE0D6'}` }}>
              {missingRequired.length ? 'incomplete' : 'configured'}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
              disabled={disconnecting}
              style={{ background: 'none', border: '1px solid #E3C4BB', color: '#B34A3C', padding: '0.3rem 0.65rem', fontSize: '0.7rem', fontFamily: "'Inter',sans-serif", cursor: disconnecting ? 'not-allowed' : 'pointer', borderRadius: 4 }}
            >
              {disconnecting ? '…' : 'Disconnect'}
            </button>
          </div>
        )}
      </div>

      {(expanded || filledFields.size === 0) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            {provider.fields.map(f => {
              const isFilled = filledFields.has(f.name);
              return (
                <div key={f.name}>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#67655A', marginBottom: '0.25rem' }}>
                    {f.label}{f.required && !isFilled ? ' *' : ''}{isFilled ? ' (already set)' : ''}
                  </label>
                  <input
                    type={f.secret ? 'password' : 'text'}
                    value={values[f.name] ?? ''}
                    onChange={e => setValues_(f.name, e.target.value)}
                    placeholder={isFilled ? 'leave blank to keep current value' : f.placeholder}
                    style={inputStyle}
                  />
                  {f.help && <p style={{ fontSize: '0.68rem', color: '#9E9C8F', margin: '0.2rem 0 0' }}>{f.help}</p>}
                </div>
              );
            })}
          </div>

          {error && <p style={{ fontSize: '0.75rem', color: '#B34A3C', margin: '0.6rem 0 0' }}>{error}</p>}
          {saved && !error && <p style={{ fontSize: '0.75rem', color: '#3C7E6A', margin: '0.6rem 0 0' }}>Saved.</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ marginTop: '0.7rem', background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.45rem 1rem', fontSize: '0.78rem', fontFamily: "'Inter',sans-serif", cursor: saving ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {saving && <Spinner size={12} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Owner view ────────────────────────────────────────────────────────────────

interface AgentSignedApiRow {
  provider_key:         string;
  enabled:              boolean;
  available_to_members: boolean;
}

function OwnerSignedApisView() {
  const { agentId, agent } = useAgentCtx();
  const { catalog, credentials, loading, loadError, reloadCredentials } = useSignedApiData(agentId);
  const [rows, setRows] = useState<Record<string, AgentSignedApiRow>>({});
  const [rowsLoading, setRowsLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const isShared = !!agent?.visibility && agent.visibility !== 'personal';

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('agent_signed_apis')
        .select('provider_key, enabled, available_to_members')
        .eq('agent_id', agentId);
      const map: Record<string, AgentSignedApiRow> = {};
      for (const r of (data as AgentSignedApiRow[]) ?? []) map[r.provider_key] = r;
      setRows(map);
      setRowsLoading(false);
    })();
  }, [agentId]);

  const handleToggleEnabled = async (key: string) => {
    const current = rows[key];
    const nextEnabled = !current?.enabled;
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await supabase
      .from('agent_signed_apis')
      .upsert({ agent_id: agentId, provider_key: key, enabled: nextEnabled }, { onConflict: 'agent_id,provider_key' });
    setPendingKey(null);
    if (!error) setRows(prev => ({ ...prev, [key]: { ...(prev[key] ?? { provider_key: key, available_to_members: true }), enabled: nextEnabled } }));
  };

  const handleToggleMemberAccess = async (key: string) => {
    const current = rows[key];
    const nextAvailable = !(current?.available_to_members ?? true);
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await supabase
      .from('agent_signed_apis')
      .upsert({ agent_id: agentId, provider_key: key, available_to_members: nextAvailable }, { onConflict: 'agent_id,provider_key' });
    setPendingKey(null);
    if (!error) setRows(prev => ({ ...prev, [key]: { ...(prev[key] ?? { provider_key: key, enabled: false }), available_to_members: nextAvailable } }));
  };

  const refreshMyCredentials = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await reloadCredentials(session.user.id);
  };

  if (loading || rowsLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner size={20} color="#26251E" />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader title="Database integrations." subtitle="Connect this agent to your databases and data warehouses (AWS Athena and similar). Each person connects their own credentials." note={<>These are platform-built integrations for providers whose APIs need a computed signature, something a code_executor script can never do on its own. Turning one on lets this agent call its specific actions; each person, including you, still connects their own credentials below, separately for this agent.</>} />

        {loadError && <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0 0 1rem' }}>{loadError}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {catalog.map(p => {
            const row = rows[p.key];
            const enabled = row?.enabled ?? false;
            const availableToMembers = row?.available_to_members ?? true;
            return (
              <div key={p.key} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', minWidth: 0 }}>
                    <ProviderIcon providerKey={p.key} name={p.name} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.3rem' }}>{p.name}</p>
                      <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{p.description}</p>
                      <p style={{ fontSize: '0.7rem', color: '#9E9C8F', margin: '0.35rem 0 0' }}>
                        Actions: {p.actions.map(a => a.name).join(', ')}
                      </p>
                    </div>
                  </div>
                  <EnableToggles
                    enabled={enabled}
                    onToggleEnabled={() => handleToggleEnabled(p.key)}
                    enabledPending={pendingKey === p.key}
                    showForUsers={isShared}
                    forUsersEnabled={availableToMembers}
                    onToggleForUsers={() => handleToggleMemberAccess(p.key)}
                    forUsersPending={pendingKey === p.key}
                  />
                </div>

                {enabled && (
                  <CredentialForm
                    agentId={agentId}
                    provider={p}
                    credential={credentials[p.key] ?? null}
                    onSaved={refreshMyCredentials}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Member view ───────────────────────────────────────────────────────────────
// RLS (agent_signed_apis_member_read) only ever returns providers that are
// both enabled AND available_to_members, so there's nothing to filter
// client-side here.

function MemberSignedApisView() {
  const { agentId } = useAgentCtx();
  const { catalog, credentials, loading, loadError, reloadCredentials } = useSignedApiData(agentId);

  const refreshMyCredentials = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await reloadCredentials(session.user.id);
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
        <TabHeader title="Connect your own credentials." subtitle="Connect your own credentials for these integrations, for this agent only. Encrypted at rest; the agent never receives the raw values." />

        {loadError && <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0 0 1rem' }}>{loadError}</p>}

        {catalog.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>This agent doesn&apos;t have any database integrations turned on for you.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {catalog.map(p => (
              <div key={p.key} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <ProviderIcon providerKey={p.key} name={p.name} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.3rem' }}>{p.name}</p>
                    <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{p.description}</p>
                  </div>
                </div>
                <CredentialForm
                  agentId={agentId}
                  provider={p}
                  credential={credentials[p.key] ?? null}
                  onSaved={refreshMyCredentials}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SignedApisPage() {
  const { role } = useAgentCtx();
  return <ComingSoon feature="Database Integrations">{role === 'owner' ? <OwnerSignedApisView /> : <MemberSignedApisView />}</ComingSoon>;
}
