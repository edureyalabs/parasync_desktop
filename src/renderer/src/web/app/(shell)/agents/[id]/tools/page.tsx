// app/(shell)/agents/[id]/tools/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import ConfirmModal from '@/components/ConfirmModal';
import { EnableToggles } from '@/components/EnableToggles';
import { ToolEditor } from '@/components/tool-builder/ToolEditor';
import { Chip, IconTile, Spinner } from '@/components/tool-builder/ui';
import { Icon } from '@/components/icons/Icon';
import { C } from '@/components/account/tokens';
import { ToolGuideButton } from '@/components/tool-builder/ToolGuide';
import { AgentBuiltRow, useAgentBuiltTools } from '@/components/tool-builder/AgentBuiltTools';
import { typeLabel, upgradeVariable, type Tool } from '@/components/tool-builder/types';
import { TabHeader, HeaderButton } from '@/components/agent-ui/TabHeader';

// ─── Member view — read-only, no code/secrets/test panel, just what the
// agent can currently do. RLS (tools_member_read) only ever returns rows
// that are both enabled AND available_to_members, so there's no
// disabled/owner-only state to filter out client-side here. ───────────────────

function MemberToolsView() {
  const { agentId } = useAgentCtx();
  // Tool Builder tools and the ones the agent built for itself, in one list. RLS returns a member only those the owner
  // switched on for connected people (tools_member_read, agent_created_tools_member_read).
  const [tools, setTools] = useState<(Tool & { agentBuilt?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const [admin, built] = await Promise.all([
        supabase.from('tools').select('id, name, description, type, config, enabled, created_at').eq('agent_id', agentId),
        supabase.from('agent_created_tools').select('id, name, description, config, enabled, created_at').eq('agent_id', agentId),
      ]);
      const merged = [
        ...(((admin.data as Tool[]) ?? [])),
        ...(((built.data as Tool[]) ?? []).map(t => ({ ...t, agentBuilt: true }))),
      ].sort((a, b) => a.name.localeCompare(b.name));
      setTools(merged);
      setLoading(false);
    })();
  }, [agentId]);

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
        <TabHeader title="What it can do." subtitle="Abilities this agent currently has, beyond plain conversation." />

        {tools.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No extra tools — just conversation.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {tools.map(t => (
              <div key={t.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '0.9rem 1.15rem', display: 'flex', gap: '0.95rem', alignItems: 'flex-start' }}>
                <IconTile icon={t.agentBuilt ? 'wand-sparkles' : 'wrench'} color={t.agentBuilt ? '#5B4B8A' : C.brassDeep} size={40} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.25rem', flexWrap: 'wrap' }}>
                    <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.88rem', fontWeight: 500, color: C.ink, margin: 0 }}>{t.name}</p>
                    {t.agentBuilt && <Chip tone="violet">Agent-built</Chip>}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0, lineHeight: 1.6 }}>{t.description || 'No description.'}</p>
                  {(t.config?.variables ?? []).length > 0 && (
                    <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.4rem 0 0', lineHeight: 1.5 }}>
                      Takes: {(t.config.variables ?? []).map(upgradeVariable).map(v => `${v.name} (${typeLabel(v.data_type)})`).join(', ')}
                    </p>
                  )}
                  {t.config?.output?.description && (
                    <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.2rem 0 0', lineHeight: 1.5 }}>Returns: {t.config.output.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── List page ────────────────────────────────────────────────────────────────

function OwnerToolsView() {
  const { agentId, agent } = useAgentCtx();
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tool | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tool | null>(null);
  const built = useAgentBuiltTools(agentId);

  // Per-tool member-access toggle only means anything once this agent can be
  // shared at all — hidden entirely for personal agents, same gating the
  // billing-mode toggle on the Profile tab already uses.
  const isShared = !!agent?.visibility && agent.visibility !== 'personal';

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('tools')
        .select('id, name, description, type, config, enabled, available_to_members, created_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: true });
      setTools((data as Tool[]) ?? []);
      setLoading(false);
    })();
  }, [agentId]);

  const handleSaved = (t: Tool) => {
    setTools(prev => {
      const exists = prev.some(p => p.id === t.id);
      return exists ? prev.map(p => p.id === t.id ? t : p) : [...prev, t];
    });
    setEditing(null);
  };

  const handleToggle = async (t: Tool) => {
    const supabase = createClient();
    const { data } = await supabase.from('tools').update({ enabled: !t.enabled }).eq('id', t.id).select().single();
    if (data) setTools(prev => prev.map(p => p.id === t.id ? (data as Tool) : p));
  };

  const handleToggleMemberAccess = async (t: Tool) => {
    const supabase = createClient();
    const { data } = await supabase.from('tools').update({ available_to_members: !t.available_to_members }).eq('id', t.id).select().single();
    if (data) setTools(prev => prev.map(p => p.id === t.id ? (data as Tool) : p));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    const supabase = createClient();
    const { error } = await supabase.from('tools').delete().eq('id', deleteTarget.id);
    setDeletingId(null);
    if (!error) {
      setTools(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  // One list: the tools an admin builds and the ones the agent built for itself, oldest first.
  const entries = [
    ...tools.map(tool => ({ kind: 'admin' as const, tool, at: tool.created_at })),
    ...built.tools.map(tool => ({ kind: 'built' as const, tool, at: tool.created_at })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner size={20} color="#26251E" />
      </div>
    );
  }

  if (editing) {
    return (
      <ToolEditor
        orgId={agent?.org_id}
        agentId={agentId}
        existing={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader
          title="Build custom tools."
          subtitle="Python tools you write for this agent, plus any it built for itself. Each is built in six steps, tested, then saved."
          actions={(
            <>
              <ToolGuideButton />
              <HeaderButton plus onClick={() => setEditing('new')}>New tool</HeaderButton>
            </>
          )}
        />

        {tools.length === 0 && built.tools.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: '3rem 2rem', textAlign: 'center', background: '#fff' }}>
            <div style={{ display: 'inline-flex', marginBottom: '0.9rem' }}><IconTile icon="wrench" color={C.brassDeep} size={44} /></div>
            <p style={{ fontSize: '0.95rem', fontWeight: 500, color: C.ink, margin: '0 0 0.35rem' }}>No custom tools yet</p>
            <p style={{ fontSize: '0.82rem', color: C.soft, lineHeight: 1.6, margin: '0 auto 1.2rem', maxWidth: 420 }}>
              A tool is a small Python function the agent can call: look something up, call an API, build a file. You describe it, write it, test it and save it in six short steps.
            </p>
            <HeaderButton plus onClick={() => setEditing('new')}>Build your first tool</HeaderButton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {entries.map(entry => entry.kind === 'built' ? (
              <AgentBuiltRow key={`built-${entry.tool.id}`} tool={entry.tool} isShared={isShared} onSwitch={built.setSwitch} onDeleted={built.remove} />
            ) : (() => { const t = entry.tool; const argCount = (t.config?.variables ?? []).length; return (
              <div key={t.id} style={{ background: '#fff', border: `1px solid ${t.enabled ? '#CFC9B6' : C.line}`, borderRadius: 10, padding: '0.9rem 1.15rem', display: 'flex', alignItems: 'center', gap: '0.95rem', flexWrap: 'wrap' }}>
                <IconTile icon="wrench" color={C.brassDeep} size={40} />
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.88rem', fontWeight: 500, color: C.ink, margin: 0 }}>{t.name}</p>
                    {!t.enabled && <Chip>Off</Chip>}
                    <Chip tone="brass">{argCount} input{argCount === 1 ? '' : 's'}</Chip>
                    {t.config?.output && t.config.output.kind !== 'value' && <Chip tone="green">{t.config.output.kind === 'file' ? 'Returns a file' : 'Value + file'}</Chip>}
                    {(t.config?.secrets ?? []).length > 0 && <Chip tone="neutral">{(t.config?.secrets ?? []).length} secret{(t.config?.secrets ?? []).length === 1 ? '' : 's'}</Chip>}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0, lineHeight: 1.6 }}>{t.description || 'No description.'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                  <EnableToggles
                    enabled={t.enabled}
                    onToggleEnabled={() => handleToggle(t)}
                    showForUsers={isShared}
                    forUsersEnabled={t.available_to_members}
                    onToggleForUsers={() => handleToggleMemberAccess(t)}
                  />
                  <button type="button" className="tb-btn tb-btn-outline" onClick={() => setEditing(t)}><Icon name="pencil" size={13} />Edit</button>
                  <button
                    type="button" className="tb-btn tb-btn-outline" onClick={() => setDeleteTarget(t)} disabled={deletingId === t.id}
                    aria-label={`Delete ${t.name}`} title="Delete" style={{ color: C.red, borderColor: C.redLine, padding: '0 0.6rem' }}
                  >
                    {deletingId === t.id ? '…' : <Icon name="trash" size={14} />}
                  </button>
                </div>
              </div>
            ); })())}
          </div>
        )}

      </div>

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This removes the tool permanently — the agent will no longer be able to call it, and it cannot be recovered."
          loading={deletingId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

export default function ToolsPage() {
  const { role } = useAgentCtx();
  return role === 'owner' ? <OwnerToolsView /> : <MemberToolsView />;
}
