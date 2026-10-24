// src/renderer/src/views/agent/tabs.ts
// Which settings tabs an agent shows, in the web app's order. Connectors and Watch Tower are deliberately not here: the web app
// no longer shows them either.
import { useAsync } from '@/hooks/useAsync';
import type { AgentRoleState } from '@/hooks/useAgentRole';
import { supabase } from '@/lib/supabase';

export type TabKey =
  | 'runsheet' | 'platform-tools' | 'email' | 'whatsapp' | 'tools' | 'instructions' | 'secrets' | 'signed-apis' | 'mcp'
  | 'browser-access' | 'network' | 'workspace' | 'profile' | 'keys';

export interface TabDef {
  key: TabKey;
  label: string;
}

/** What decides whether a connected person's optional tabs exist (each one is hidden while it would be empty). */
export interface MemberFlags {
  sharedInstructions: boolean;
  keyDefs: boolean;
  signedApis: boolean;
}

export function useMemberFlags(agentId: string, isOwner: boolean) {
  return useAsync<MemberFlags>(async () => {
    if (isOwner) return { sharedInstructions: false, keyDefs: false, signedApis: false };
    const head = (table: string) => supabase.from(table).select('*', { count: 'exact', head: true }).eq('agent_id', agentId);
    const [instr, defs, apis] = await Promise.all([
      head('instructions').eq('enabled', true).eq('available_to_members', true),
      head('agent_user_secret_defs'),
      head('agent_signed_apis').eq('enabled', true).eq('available_to_members', true),
    ]);
    return { sharedInstructions: (instr.count ?? 0) > 0, keyDefs: (defs.count ?? 0) > 0, signedApis: (apis.count ?? 0) > 0 };
  }, [agentId, isOwner]);
}

const has = (set: ReadonlySet<string>, ...keys: string[]) => keys.some((k) => set.has(k));

export function tabsFor(ctx: AgentRoleState, flags: MemberFlags | null): TabDef[] {
  const isPrivate = ctx.agent.visibility === 'private';
  if (ctx.isOwner) {
    const all: (TabDef | false)[] = [
      { key: 'runsheet', label: 'Runsheet' },
      { key: 'platform-tools', label: 'Platform Tools' },
      has(ctx.enabledTools, 'send_email') && { key: 'email', label: 'Emails' },
      has(ctx.enabledTools, 'whatsapp_chats', 'whatsapp_read', 'whatsapp_send') && { key: 'whatsapp', label: 'WhatsApp' },
      { key: 'tools', label: 'Tool Builder' },
      { key: 'instructions', label: 'Instructions' },
      { key: 'secrets', label: 'Secrets' },
      { key: 'signed-apis', label: 'Database Integrations' },
      { key: 'mcp', label: 'MCP' },
      { key: 'browser-access', label: 'Browser Access' },
      { key: 'network', label: 'Add Users' },
      { key: 'workspace', label: 'Workspace' },
      { key: 'profile', label: 'Agent Profile' },
    ];
    // Add Users only means something for a private agent (invites); a personal one is not shared and a public one adds people through Discover.
    return all.filter((t): t is TabDef => !!t && (t.key !== 'network' || isPrivate));
  }
  const all: (TabDef | false)[] = [
    { key: 'runsheet', label: 'Runsheet' },
    !isPrivate && { key: 'tools', label: 'Tools' },
    !!flags?.sharedInstructions && !isPrivate && { key: 'instructions', label: 'Instructions' },
    !!flags?.keyDefs && { key: 'keys', label: 'My Keys' },
    !!flags?.signedApis && { key: 'signed-apis', label: 'Database Integrations' },
    { key: 'workspace', label: 'Workspace' },
    { key: 'profile', label: 'Agent Profile' },
  ];
  return all.filter((t): t is TabDef => !!t);
}
