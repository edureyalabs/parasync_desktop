// src/renderer/src/lib/agents.ts
import { getLastRead } from '@/lib/readState';
import { supabase } from '@/lib/supabase';
import type { AgentRow } from '@/lib/types';

interface NetworkRow {
  status: 'active' | 'paused';
  agent: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    visibility: 'personal' | 'private' | 'public';
    avatar_url: string | null;
  } | null;
}

export interface AgentListItem extends AgentRow {
  chatId: string | null;
  lastMessage: { role: string; content: string; created_at: string } | null;
  unread: boolean;
}

async function loadBaseAgents(userId: string): Promise<AgentRow[]> {
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id').eq('owner_id', userId);
  if (orgErr) throw new Error(`organizations: ${orgErr.message}`);

  const owned: AgentRow[] = [];
  const orgIds = (orgs ?? []).map((o) => o.id as string);
  if (orgIds.length > 0) {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, description, active, visibility, avatar_url')
      .in('org_id', orgIds)
      .order('name', { ascending: true });
    if (error) throw new Error(`agents: ${error.message}`);
    for (const a of data ?? []) {
      owned.push({ id: a.id, name: a.name, description: a.description, active: a.active, visibility: a.visibility, avatarUrl: a.avatar_url, isOwner: true });
    }
  }

  const { data: network, error: netErr } = await supabase
    .from('agent_network')
    .select('status, agent:agents(id, name, description, active, visibility, avatar_url)')
    .eq('user_id', userId)
    .returns<NetworkRow[]>();
  if (netErr) throw new Error(`agent_network: ${netErr.message}`);

  const connected: AgentRow[] = (network ?? [])
    .filter((r): r is NetworkRow & { agent: NonNullable<NetworkRow['agent']> } => r.agent !== null)
    .map((r) => ({
      id: r.agent.id,
      name: r.agent.name,
      description: r.agent.description,
      active: r.agent.active,
      visibility: r.agent.visibility,
      avatarUrl: r.agent.avatar_url,
      isOwner: false,
      networkStatus: r.status,
    }));

  return [...owned, ...connected];
}

/** Agents with each chat's last message, newest conversation first (like a messaging app). */
export async function loadAgentList(userId: string): Promise<AgentListItem[]> {
  const agents = await loadBaseAgents(userId);
  if (agents.length === 0) return [];

  const ids = agents.map((a) => a.id);
  const { data: chats } = await supabase.from('chats').select('id, agent_id').eq('created_by', userId).in('agent_id', ids);
  const lastRead = getLastRead(ids);
  const chatByAgent = new Map(((chats ?? []) as { id: string; agent_id: string }[]).map((c) => [c.agent_id, c.id]));

  // One tiny query per chat: a shared "latest N across all chats" query lets one busy chat starve the rest.
  const lastByChat = new Map<string, { role: string; content: string; created_at: string }>();
  await Promise.all(
    [...chatByAgent.values()].map(async (chatId) => {
      const { data } = await supabase
        .from('messages')
        .select('role, content, created_at')
        .eq('chat_id', chatId)
        .or('private.is.null,private.eq.false')
        .neq('role', 'tool')
        .order('created_at', { ascending: false })
        .limit(1);
      const m = (data as { role: string; content: string; created_at: string }[] | null)?.[0];
      if (m) lastByChat.set(chatId, m);
    }),
  );

  const items: AgentListItem[] = agents.map((a) => {
    const chatId = chatByAgent.get(a.id) ?? null;
    const last = chatId ? (lastByChat.get(chatId) ?? null) : null;
    const read = lastRead[a.id];
    return { ...a, chatId, lastMessage: last, unread: !!last && last.role !== 'user' && !!read && last.created_at > read };
  });

  return items.sort((a, b) => {
    const ta = a.lastMessage?.created_at ?? '';
    const tb = b.lastMessage?.created_at ?? '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
