// src/renderer/src/hooks/useAgentRole.ts
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { NetworkStatus, Visibility } from '@/lib/types';

export interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  org_id: string;
  created_at: string;
  active: boolean;
  visibility: Visibility;
  is_verified: boolean | null;
  avatar_url: string | null;
  bio: string | null;
  handle: string | null;
  // Owner-only: the agent's persona. Never requested for a connected person (the row is readable to them, the persona is not theirs to see).
  role?: string | null;
  goal?: string | null;
  backstory?: string | null;
  billing_mode?: 'owner_pays' | 'user_pays' | null;
}

export interface AgentRoleState {
  agent: AgentDetail;
  isOwner: boolean;
  /** For a connected person. */
  network: { status: NetworkStatus; connected_at: string } | null;
  /** Platform tool keys switched on (owner only): decides whether the Email and WhatsApp tabs exist. */
  enabledTools: ReadonlySet<string>;
}

const COMMON = 'id, name, description, org_id, created_at, active, visibility, is_verified, avatar_url, bio, handle';
const OWNER_EXTRA = ', role, goal, backstory, billing_mode';

/** Who the signed-in person is to this agent (its owner, or a connected person) and the agent's details accordingly. */
export function useAgentRole(agentId: string) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useAsync<AgentRoleState>(async () => {
    if (!userId) throw new Error('You are signed out.');
    const { data: base, error } = await supabase.from('agents').select('org_id').eq('id', agentId).maybeSingle();
    if (error) throw new Error('This agent could not be loaded.');
    if (!base) throw new Error('This agent is not available.');

    const { data: org } = await supabase.from('organizations').select('owner_id').eq('id', base.org_id).maybeSingle();
    const isOwner = !!org && org.owner_id === userId;

    const { data: agent, error: agentError } = await supabase.from('agents').select(isOwner ? COMMON + OWNER_EXTRA : COMMON).eq('id', agentId).maybeSingle();
    if (agentError || !agent) throw new Error('This agent could not be loaded.');

    let network: AgentRoleState['network'] = null;
    if (!isOwner) {
      const { data: net } = await supabase.from('agent_network').select('status, connected_at').eq('agent_id', agentId).eq('user_id', userId).maybeSingle();
      if (!net) throw new Error('You are not connected to this agent.');
      network = { status: net.status as NetworkStatus, connected_at: net.connected_at as string };
    }

    let enabledTools = new Set<string>();
    if (isOwner) {
      const { data: tools } = await supabase.from('agent_platform_tools').select('tool_key').eq('agent_id', agentId).eq('enabled', true);
      enabledTools = new Set(((tools ?? []) as { tool_key: string }[]).map((t) => t.tool_key));
    }
    return { agent: agent as unknown as AgentDetail, isOwner, network, enabledTools };
  }, [agentId, userId]);
}
