// app/(shell)/agents/[id]/mcp/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { EnableToggles } from '@/components/EnableToggles';
import { TabHeader, HeaderButton } from '@/components/agent-ui/TabHeader';
import { ComingSoon } from '@/components/agent-header/ComingSoon';

interface McpTool {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

interface McpServer {
  id: string;
  name: string;
  url: string;
  auth_type: 'none' | 'bearer' | 'header' | 'oauth';
  auth_header_name: string | null;
  enabled: boolean;
  available_to_members: boolean;
  tools_cache: McpTool[];
  tools_cached_at: string | null;
  oauth_expires_at: string | null;
  needs_reconnect: boolean;
}

function Spinner({ size = 14, color = '#26251E' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid #DAD5C5`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.55rem 0.7rem', fontSize: '0.82rem', fontFamily: "'Inter',sans-serif",
  border: '1px solid #DAD5C5', borderRadius: 4, background: '#fff', color: '#26251E',
};

// ─── Banner for the ?mcp_connected=/?mcp_oauth_error= redirect back from OAuth ─

function RedirectBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Captured once on first render, independent of the URL stripping below —
  // otherwise the banner would vanish the instant router.replace fires,
  // before the admin ever got to read it.
  const [connected] = useState(() => params.get('mcp_connected'));
  const [error, setError] = useState(() => params.get('mcp_oauth_error'));

  useEffect(() => {
    // Strips ?mcp_connected=/?mcp_oauth_error= from the URL right after
    // reading them — otherwise a plain page refresh keeps re-showing a
    // stale banner forever, since the query string never went away on its
    // own (confirmed live: an error banner stuck around across refreshes).
    if (connected || error) router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!connected && !error) return null;

  return (
    <div style={{
      marginBottom: '1.25rem', padding: '0.7rem 1rem', borderRadius: 4, fontSize: '0.82rem',
      background: connected ? '#E6F1EC' : '#F5E6E1',
      border: `1px solid ${connected ? '#BFE0D6' : '#E3C4BB'}`,
      color: connected ? '#3C7E6A' : '#B34A3C',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
    }}>
      <span>{connected ? `Connected "${connected}" successfully.` : error}</span>
      {!connected && (
        <button
          onClick={() => setError(null)}
          style={{ background: 'none', border: 'none', color: '#B34A3C', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: 0, flexShrink: 0 }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─── Add-server modal ───────────────────────────────────────────────────────

function AddServerModal({ agentId, onClose, onCreated }: {
  agentId: string;
  onClose: () => void;
  onCreated: (server: McpServer) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<'oauth' | 'bearer' | 'header' | 'none'>('oauth');
  const [headerName, setHeaderName] = useState('');
  const [authValue, setAuthValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required.');
      return;
    }
    if (authType === 'header' && !headerName.trim()) {
      setError('Header name is required for header auth.');
      return;
    }
    if ((authType === 'bearer' || authType === 'header') && !authValue.trim()) {
      setError('An auth value is required for this auth type.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp-servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          auth_type: authType,
          auth_header_name: authType === 'header' ? headerName.trim() : null,
          auth_value: authType === 'bearer' || authType === 'header' ? authValue.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || data.discovery_error || 'Failed to add MCP server.');
        return;
      }
      if (authType === 'oauth') {
        // Straight into the Connect flow — an oauth-type server is useless
        // until an admin actually authorizes it, so there's no reason to
        // make that a separate second step back on the list page.
        window.location.assign(`/api/agents/${agentId}/mcp-servers/${data.server.id}/oauth/authorize`);
        return;
      }
      onCreated({ ...data.server, tools_cache: data.tools ?? [] });
      onClose();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(38,37,30,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '1.75rem', width: 440, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, color: '#26251E', margin: '0 0 1.1rem' }}>Add MCP server</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#67655A', display: 'block', marginBottom: '0.3rem' }}>Name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. stripe" />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#67655A', display: 'block', marginBottom: '0.3rem' }}>Server URL</label>
            <input style={inputStyle} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#67655A', display: 'block', marginBottom: '0.3rem' }}>Authentication</label>
            <select style={inputStyle} value={authType} onChange={e => setAuthType(e.target.value as typeof authType)}>
              <option value="oauth">Sign in (OAuth) — recommended</option>
              <option value="bearer">Static bearer token</option>
              <option value="header">Static custom header</option>
              <option value="none">None</option>
            </select>
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.35rem 0 0', lineHeight: 1.5 }}>
              {authType === 'oauth'
                ? 'Standard for MCP servers — you\'ll sign in through the server\'s own login page after adding it, same as connecting Gmail or Outlook. No token to copy or store yourself.'
                : 'Only use this if the server\'s docs explicitly give you a static API key to paste in — most real MCP servers expect OAuth instead.'}
            </p>
          </div>
          {authType === 'header' && (
            <div>
              <label style={{ fontSize: '0.75rem', color: '#67655A', display: 'block', marginBottom: '0.3rem' }}>Header name</label>
              <input style={inputStyle} value={headerName} onChange={e => setHeaderName(e.target.value)} placeholder="X-API-Key" />
            </div>
          )}
          {(authType === 'bearer' || authType === 'header') && (
            <div>
              <label style={{ fontSize: '0.75rem', color: '#67655A', display: 'block', marginBottom: '0.3rem' }}>
                {authType === 'bearer' ? 'Bearer token' : 'Header value'}
              </label>
              <input style={inputStyle} type="password" value={authValue} onChange={e => setAuthValue(e.target.value)} />
            </div>
          )}

          {error && <p style={{ fontSize: '0.78rem', color: '#B34A3C', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#67655A', padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: 4, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.5rem 1.1rem', fontSize: '0.8rem', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {saving && <Spinner size={12} color="#fff" />}
              {saving ? (authType === 'oauth' ? 'Redirecting…' : 'Adding…') : (authType === 'oauth' ? 'Add & sign in' : 'Add server')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Server card ─────────────────────────────────────────────────────────────

function ServerCard({ server, agentId, isShared, onUpdated, onDeleted }: {
  server: McpServer;
  agentId: string;
  isShared: boolean;
  onUpdated: (server: McpServer) => void;
  onDeleted: (id: string) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);

  const handleToggle = async (field: 'enabled' | 'available_to_members') => {
    setPending(true);
    const next = !server[field];
    const supabase = createClient();
    const { error } = await supabase.from('agent_mcp_servers').update({ [field]: next }).eq('id', server.id);
    setPending(false);
    if (!error) onUpdated({ ...server, [field]: next });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp-servers/${server.id}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRefreshError(data.error || 'Refresh failed.');
      } else {
        onUpdated({ ...server, tools_cache: data.tools ?? [], tools_cached_at: new Date().toISOString() });
        setExpanded(true);
      }
    } catch {
      setRefreshError('Could not reach the server.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove MCP server "${server.name}"? Any tools it provides will no longer be available to the agent.`)) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('agent_mcp_servers').delete().eq('id', server.id);
    setDeleting(false);
    if (!error) onDeleted(server.id);
  };

  const toolCount = server.tools_cache?.length ?? 0;
  const isOauth = server.auth_type === 'oauth';
  const isConnected = isOauth && !!server.oauth_expires_at && !server.needs_reconnect;

  return (
    <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.85rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.3rem' }}>{server.name}</p>
            {isOauth && (
              <span style={{
                fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3, marginBottom: '0.3rem',
                background: server.needs_reconnect ? '#F5E6E1' : isConnected ? '#E6F1EC' : '#F3F1E8',
                color: server.needs_reconnect ? '#B34A3C' : isConnected ? '#3C7E6A' : '#9E9C8F',
                border: `1px solid ${server.needs_reconnect ? '#E3C4BB' : isConnected ? '#BFE0D6' : '#DAD5C5'}`,
              }}>
                {server.needs_reconnect ? 'reconnect needed' : isConnected ? 'connected' : 'not connected'}
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.78rem', color: '#9E9C8F', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.url}</p>
        </div>
        <EnableToggles
          enabled={server.enabled}
          onToggleEnabled={() => handleToggle('enabled')}
          enabledPending={pending}
          showForUsers={isShared}
          forUsersEnabled={server.available_to_members}
          onToggleForUsers={() => handleToggle('available_to_members')}
          forUsersPending={pending}
        />
      </div>

      <div style={{ borderTop: '1px solid #EDEBE2', paddingTop: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', color: '#67655A', fontSize: '0.78rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {toolCount} tool{toolCount === 1 ? '' : 's'} cached
          {server.tools_cached_at && <span style={{ color: '#9E9C8F' }}>· {expanded ? 'hide' : 'show'}</span>}
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isOauth && !isConnected ? (
            <a
              href={`/api/agents/${agentId}/mcp-servers/${server.id}/oauth/authorize`}
              style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.35rem 0.85rem', fontSize: '0.72rem', borderRadius: 4, cursor: 'pointer', textDecoration: 'none' }}
            >
              {server.needs_reconnect ? 'Reconnect' : 'Connect'}
            </a>
          ) : (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{ background: 'none', border: '1px solid #DAD5C5', color: '#26251E', padding: '0.35rem 0.75rem', fontSize: '0.72rem', borderRadius: 4, cursor: refreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              {refreshing && <Spinner size={11} />}
              {refreshing ? 'Refreshing…' : 'Refresh tools'}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ background: 'none', border: '1px solid #E3C4BB', color: '#B34A3C', padding: '0.35rem 0.75rem', fontSize: '0.72rem', borderRadius: 4, cursor: deleting ? 'not-allowed' : 'pointer' }}
          >
            {deleting ? '…' : 'Remove'}
          </button>
        </div>
      </div>

      {refreshError && <p style={{ fontSize: '0.75rem', color: '#B34A3C', margin: 0 }}>{refreshError}</p>}

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '0.2rem' }}>
          {toolCount === 0 ? (
            <p style={{ fontSize: '0.75rem', color: '#9E9C8F', margin: 0 }}>No tools discovered yet.</p>
          ) : (
            server.tools_cache.map(t => (
              <div key={t.name} style={{ background: '#F7F6F2', border: '1px solid #EDEBE2', borderRadius: 4, padding: '0.5rem 0.7rem' }}>
                <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.72rem', color: '#26251E', margin: '0 0 0.2rem' }}>mcp__{server.name}__{t.name}</p>
                {t.description && <p style={{ fontSize: '0.72rem', color: '#67655A', margin: 0 }}>{t.description}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

function McpView() {
  const { agentId, agent } = useAgentCtx();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const isShared = !!agent?.visibility && agent.visibility !== 'personal';

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('agent_mcp_servers')
        .select('id, name, url, auth_type, auth_header_name, enabled, available_to_members, tools_cache, tools_cached_at, oauth_expires_at, needs_reconnect')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: true });
      setServers((data as McpServer[]) ?? []);
      setLoading(false);
    })();
  }, [agentId]);

  const handleUpdated = (updated: McpServer) => {
    setServers(prev => prev.map(s => (s.id === updated.id ? updated : s)));
  };
  const handleDeleted = (id: string) => {
    setServers(prev => prev.filter(s => s.id !== id));
  };
  const handleCreated = (server: McpServer) => {
    setServers(prev => [...prev, server]);
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
          title="External tool servers."
          subtitle="Model Context Protocol servers whose tools merge into this agent's own tool set."
          note="bemain talks to each server directly using the auth you provide here. The model never sees the server URL or credential, only the tools it exposes."
          actions={<HeaderButton plus onClick={() => setShowAddModal(true)}>Add server</HeaderButton>}
        />

        <RedirectBanner />

        {servers.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No MCP servers configured yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {servers.map(s => (
              <ServerCard key={s.id} server={s} agentId={agentId} isShared={isShared} onUpdated={handleUpdated} onDeleted={handleDeleted} />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddServerModal agentId={agentId} onClose={() => setShowAddModal(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

export default function McpPage() {
  return <ComingSoon feature="MCP servers"><McpView /></ComingSoon>;
}
