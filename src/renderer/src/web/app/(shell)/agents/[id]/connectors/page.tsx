// app/agents/[id]/connectors/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { EnableToggles } from '@/components/EnableToggles';
import { TabHeader } from '@/components/agent-ui/TabHeader';
import { ComingSoon } from '@/components/agent-header/ComingSoon';

interface ConnectorCatalogEntry {
  key:         string;
  provider:    string;
  name:        string;
  description: string;
}

interface ConnectorAccount {
  provider:        string;
  account_email:   string;
  needs_reconnect: boolean;
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// Static files at /public/icons/{key}.svg — swap either file for the official
// brand asset any time without touching this component (see connectors.md).
function ConnectorIcon({ connectorKey, name }: { connectorKey: string; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local static SVGs, no static import list needed
    <img src={`/icons/${connectorKey}.svg`} alt={name} width={24} height={24} style={{ flexShrink: 0, borderRadius: 4 }} />
  );
}

// ─── Banner for the ?connected=/?connector_error= redirect back from OAuth ────

function RedirectBanner() {
  const params = useSearchParams();
  const connected = params.get('connected');
  const error = params.get('connector_error');

  if (!connected && !error) return null;

  const errorMessages: Record<string, string> = {
    denied:          'You declined the connection request.',
    invalid_request: 'Something was missing from that request — please try connecting again.',
    invalid_state:   'That connection attempt expired or looked tampered with — please try again.',
    not_configured:  'This connector is not fully configured yet — contact the platform admin.',
    exchange_failed: 'Could not complete the connection — please try again.',
  };

  return (
    <div style={{
      marginBottom: '1.25rem', padding: '0.7rem 1rem', borderRadius: 4, fontSize: '0.82rem',
      background: connected ? '#E6F1EC' : '#F5E6E1',
      border: `1px solid ${connected ? '#BFE0D6' : '#E3C4BB'}`,
      color: connected ? '#3C7E6A' : '#B34A3C',
    }}>
      {connected ? `Connected ${connected === 'gmail' ? 'Gmail' : 'Outlook'} successfully.` : (error && errorMessages[error]) || 'Something went wrong connecting that account.'}
    </div>
  );
}

// ─── Shared connect/disconnect control ────────────────────────────────────────

function ConnectionControl({ account, disconnecting, onConnect, onDisconnect }: {
  account:       ConnectorAccount | null;
  disconnecting: boolean;
  onConnect:     () => void;
  onDisconnect:  () => void;
}) {
  if (!account) {
    return (
      <button
        onClick={onConnect}
        style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.4rem 0.9rem', fontSize: '0.78rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4, flexShrink: 0 }}
      >
        Connect
      </button>
    );
  }

  if (account.needs_reconnect) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.62rem', padding: '0.15rem 0.45rem', borderRadius: 3, background: '#F5E6E1', color: '#B34A3C', border: '1px solid #E3C4BB' }}>
          reconnect needed
        </span>
        <button
          onClick={onConnect}
          style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.4rem 0.9rem', fontSize: '0.78rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4 }}
        >
          Reconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: '#E6F1EC', color: '#3C7E6A', border: '1px solid #BFE0D6', margin: '0 0 0.2rem', display: 'inline-block' }}>
          connected
        </p>
        <p style={{ fontSize: '0.72rem', color: '#67655A', margin: 0 }}>{account.account_email}</p>
      </div>
      <button
        onClick={onDisconnect}
        disabled={disconnecting}
        style={{ background: 'none', border: '1px solid #E3C4BB', color: '#B34A3C', padding: '0.35rem 0.75rem', fontSize: '0.72rem', fontFamily: "'Inter',sans-serif", cursor: disconnecting ? 'not-allowed' : 'pointer', borderRadius: 4 }}
      >
        {disconnecting ? '…' : 'Disconnect'}
      </button>
    </div>
  );
}

// ─── Data loading shared by both roles ────────────────────────────────────────

function useConnectorData(agentId: string) {
  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([]);
  const [accounts, setAccounts] = useState<Record<string, ConnectorAccount>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const reloadAccounts = async (userId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('agent_connector_accounts')
      .select('provider, account_email, needs_reconnect')
      .eq('agent_id', agentId)
      .eq('user_id', userId);
    const map: Record<string, ConnectorAccount> = {};
    for (const row of (data as ConnectorAccount[]) ?? []) map[row.provider] = row;
    setAccounts(map);
  };

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const [catalogRes] = await Promise.all([
        fetch('/api/connectors').then(r => r.json()).catch(() => ({ connectors: [], error: 'Network error.' })),
      ]);
      if (catalogRes.error) setLoadError(catalogRes.error);
      setCatalog((catalogRes.connectors as ConnectorCatalogEntry[]) ?? []);

      if (session) await reloadAccounts(session.user.id);
      setLoading(false);
    })();
  }, [agentId]);

  return { catalog, accounts, loading, loadError, reloadAccounts };
}

// ─── Owner view ────────────────────────────────────────────────────────────────

interface AgentConnectorRow {
  connector_key:        string;
  enabled:              boolean;
  available_to_members: boolean;
}

function OwnerConnectorsView() {
  const { agentId, agent } = useAgentCtx();
  const { catalog, accounts, loading, loadError, reloadAccounts } = useConnectorData(agentId);
  const [rows, setRows] = useState<Record<string, AgentConnectorRow>>({});
  const [rowsLoading, setRowsLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [disconnectingKey, setDisconnectingKey] = useState<string | null>(null);

  const isShared = !!agent?.visibility && agent.visibility !== 'personal';

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('agent_connectors')
        .select('connector_key, enabled, available_to_members')
        .eq('agent_id', agentId);
      const map: Record<string, AgentConnectorRow> = {};
      for (const r of (data as AgentConnectorRow[]) ?? []) map[r.connector_key] = r;
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
      .from('agent_connectors')
      .upsert({ agent_id: agentId, connector_key: key, enabled: nextEnabled }, { onConflict: 'agent_id,connector_key' });
    setPendingKey(null);
    if (!error) setRows(prev => ({ ...prev, [key]: { ...(prev[key] ?? { connector_key: key, available_to_members: true }), enabled: nextEnabled } }));
  };

  const handleToggleMemberAccess = async (key: string) => {
    const current = rows[key];
    const nextAvailable = !(current?.available_to_members ?? true);
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await supabase
      .from('agent_connectors')
      .upsert({ agent_id: agentId, connector_key: key, available_to_members: nextAvailable }, { onConflict: 'agent_id,connector_key' });
    setPendingKey(null);
    if (!error) setRows(prev => ({ ...prev, [key]: { ...(prev[key] ?? { connector_key: key, enabled: false }), available_to_members: nextAvailable } }));
  };

  const handleConnect = (provider: string) => {
    window.location.assign(`/api/connectors/${provider}/authorize?agentId=${agentId}`);
  };

  const handleDisconnect = async (provider: string) => {
    setDisconnectingKey(provider);
    const res = await fetch(`/api/agents/${agentId}/connectors/${provider}`, { method: 'DELETE' });
    setDisconnectingKey(null);
    if (res.ok) {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await reloadAccounts(session.user.id);
    }
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
        <TabHeader title="Connect real accounts." subtitle="Turn on integrations like Gmail and Outlook. Each person connects their own account below." note={<>First-party integrations with external accounts. Turning one on lets this agent use it; each person, including you, still connects their own account below, separately for this agent.</>} />

        <RedirectBanner />

        {loadError && <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0 0 1rem' }}>{loadError}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {catalog.map(c => {
            const row = rows[c.key];
            const enabled = row?.enabled ?? false;
            const availableToMembers = row?.available_to_members ?? true;
            const account = accounts[c.provider] ?? null;
            return (
              <div key={c.key} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <ConnectorIcon connectorKey={c.key} name={c.name} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.3rem' }}>{c.name}</p>
                      <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{c.description}</p>
                    </div>
                  </div>
                  <EnableToggles
                    enabled={enabled}
                    onToggleEnabled={() => handleToggleEnabled(c.key)}
                    enabledPending={pendingKey === c.key}
                    showForUsers={isShared}
                    forUsersEnabled={availableToMembers}
                    onToggleForUsers={() => handleToggleMemberAccess(c.key)}
                    forUsersPending={pendingKey === c.key}
                  />
                </div>

                {enabled && (
                  <div style={{ borderTop: '1px solid #EDEBE2', paddingTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <p style={{ fontSize: '0.75rem', color: '#9E9C8F', margin: 0 }}>Your own connection, for this agent</p>
                    <ConnectionControl
                      account={account}
                      disconnecting={disconnectingKey === c.provider}
                      onConnect={() => handleConnect(c.provider)}
                      onDisconnect={() => handleDisconnect(c.provider)}
                    />
                  </div>
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
// RLS (agent_connectors_member_read) only ever returns connectors that are
// both enabled AND available_to_members, so there's nothing to filter
// client-side here — every row shown is one this member can actually use.

function MemberConnectorsView() {
  const { agentId } = useAgentCtx();
  const { catalog, accounts, loading, loadError, reloadAccounts } = useConnectorData(agentId);
  const [disconnectingKey, setDisconnectingKey] = useState<string | null>(null);

  const handleConnect = (provider: string) => {
    window.location.assign(`/api/connectors/${provider}/authorize?agentId=${agentId}`);
  };

  const handleDisconnect = async (provider: string) => {
    setDisconnectingKey(provider);
    const res = await fetch(`/api/agents/${agentId}/connectors/${provider}`, { method: 'DELETE' });
    setDisconnectingKey(null);
    if (res.ok) {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await reloadAccounts(session.user.id);
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
        <TabHeader title="Connect your own accounts." subtitle="Connect your own account so this agent can act for you, for this agent only. Encrypted at rest." />

        <RedirectBanner />

        {loadError && <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0 0 1rem' }}>{loadError}</p>}

        {catalog.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>This agent doesn&apos;t have any connectors turned on for you.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {catalog.map(c => (
              <div key={c.key} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <ConnectorIcon connectorKey={c.key} name={c.name} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.3rem' }}>{c.name}</p>
                    <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{c.description}</p>
                  </div>
                </div>
                <ConnectionControl
                  account={accounts[c.provider] ?? null}
                  disconnecting={disconnectingKey === c.provider}
                  onConnect={() => handleConnect(c.provider)}
                  onDisconnect={() => handleDisconnect(c.provider)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConnectorsPage() {
  const { role } = useAgentCtx();
  return <ComingSoon feature="Connectors">{role === 'owner' ? <OwnerConnectorsView /> : <MemberConnectorsView />}</ComingSoon>;
}
