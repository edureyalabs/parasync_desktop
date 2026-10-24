// app/(shell)/agents/[id]/settings/page.tsx
'use client';

import { useAgentCtx } from '../layout';
import { MemberProfileView } from '@/components/agent-profile/MemberProfileView';
import { OwnerProfileView } from '@/components/agent-profile/OwnerProfileView';

// The "Agent Profile" tab (route still /settings): the owner edits the agent and sees a summary of it; a connected
// person sees a read-only profile of who they are talking to.
export default function AgentProfilePage() {
  const { role } = useAgentCtx();
  if (role === null) return null;
  return role === 'owner' ? <OwnerProfileView /> : <MemberProfileView />;
}
