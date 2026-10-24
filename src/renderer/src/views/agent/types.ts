// src/renderer/src/views/agent/types.ts
import type { AgentRoleState } from '@/hooks/useAgentRole';

/** What every settings tab is given. */
export interface TabProps {
  agentId: string;
  ctx: AgentRoleState;
}
