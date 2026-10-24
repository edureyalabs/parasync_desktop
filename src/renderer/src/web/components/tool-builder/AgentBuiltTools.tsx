// components/tool-builder/AgentBuiltTools.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ConfirmModal from '@/components/ConfirmModal';
import { EnableToggles } from '@/components/EnableToggles';
import { Icon } from '@/components/icons/Icon';
import { C } from '@/components/account/tokens';
import { Chip, IconTile } from './ui';
import { typeLabel, upgradeVariable, type ToolConfig } from './types';

// Tools the agent built for itself while working (a project, or a chat turn). They sit in the same list as the tools
// an admin builds, marked "agent-built". The agent creates and edits them; the owner can switch one on/off (and for users), look at what
// they do and delete one. They run through the agent's secretless broker, never with raw secrets.

export interface AgentBuiltTool {
  id:          string;
  name:        string;
  description: string | null;
  config:      ToolConfig;
  created_at:  string;
  enabled:     boolean;
  available_to_members: boolean;
}

const mono: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

export function useAgentBuiltTools(agentId: string) {
  const [tools, setTools] = useState<AgentBuiltTool[]>([]);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('agent_created_tools')
        .select('id, name, description, config, created_at, enabled, available_to_members')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: true });
      setTools((data as AgentBuiltTool[]) ?? []);
    })();
  }, [agentId]);

  const remove = useCallback((id: string) => setTools(prev => prev.filter(t => t.id !== id)), []);

  // The owner's two switches, same meaning as on a Tool Builder tool. Optimistic, rolled back if the write fails.
  const setSwitch = useCallback(async (id: string, field: 'enabled' | 'available_to_members', value: boolean) => {
    setTools(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    const { error } = await createClient().from('agent_created_tools').update({ [field]: value }).eq('id', id);
    if (error) setTools(prev => prev.map(t => t.id === id ? { ...t, [field]: !value } : t));
  }, []);
  return { tools, remove, setSwitch };
}

export function AgentBuiltRow({ tool, isShared, onSwitch, onDeleted }: {
  tool: AgentBuiltTool;
  isShared: boolean;
  onSwitch: (id: string, field: 'enabled' | 'available_to_members', value: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const variables = (tool.config?.variables ?? []).map(upgradeVariable);

  const confirmDelete = async () => {
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('agent_created_tools').delete().eq('id', tool.id);
    setDeleting(false);
    if (!error) onDeleted(tool.id);
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '0.9rem 1.15rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.95rem', flexWrap: 'wrap' }}>
        <IconTile icon="wand-sparkles" color="#5B4B8A" size={40} />
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <p style={{ ...mono, fontSize: '0.88rem', fontWeight: 500, color: C.ink, margin: 0 }}>{tool.name}</p>
            <Chip tone="violet">Agent-built</Chip>
            {!tool.enabled && <Chip>Off</Chip>}
          </div>
          <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0, lineHeight: 1.6 }}>{tool.description || 'No description.'}</p>
          {variables.length > 0 && (
            <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.4rem 0 0', lineHeight: 1.5 }}>
              Takes: {variables.map(v => `${v.name} (${typeLabel(v.data_type)})`).join(', ')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          <EnableToggles
            enabled={tool.enabled}
            onToggleEnabled={() => onSwitch(tool.id, 'enabled', !tool.enabled)}
            showForUsers={isShared}
            forUsersEnabled={tool.available_to_members}
            onToggleForUsers={() => onSwitch(tool.id, 'available_to_members', !tool.available_to_members)}
          />
          <button type="button" className="tb-btn tb-btn-outline" onClick={() => setOpen(o => !o)}><Icon name="code-xml" size={13} />{open ? 'Hide code' : 'View code'}</button>
          <button
            type="button" className="tb-btn tb-btn-outline" onClick={() => setConfirming(true)} aria-label={`Delete ${tool.name}`} title="Delete"
            style={{ color: C.red, borderColor: C.redLine, padding: '0 0.6rem' }}
          ><Icon name="trash" size={14} /></button>
        </div>
      </div>
      {open && (
        <pre style={{ ...mono, fontSize: '0.74rem', lineHeight: 1.55, background: '#F7F6F2', border: '1px solid #E2DFD3', borderRadius: 8, padding: '0.8rem 1rem', margin: '0.9rem 0 0', overflowX: 'auto', color: '#26251E' }}>
          {[tool.config?.preamble, tool.config?.code].filter(Boolean).join('\n\n')}
        </pre>
      )}
      {confirming && (
        <ConfirmModal
          title={`Delete "${tool.name}"?`}
          message="The agent will no longer have this tool. It can build a new one later if it needs to."
          loading={deleting}
          onClose={() => setConfirming(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
