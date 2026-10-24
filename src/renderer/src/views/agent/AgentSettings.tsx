// src/renderer/src/views/agent/AgentSettings.tsx
// The left column and the content of an open agent's settings, together. Resolves who the person is to the agent first, so each
// person only gets the tabs that are theirs.
import { AgentTabList } from '@/components/agent/AgentTabList';
import { Center, ErrorText, Spinner } from '@/components/ui';
import { useAgentRole } from '@/hooks/useAgentRole';
import { useNav } from '@/lib/nav';
import { C } from '@/lib/theme';
import { AgentContent } from '@/views/agent/AgentContent';
import { tabsFor, useMemberFlags, type TabKey } from '@/views/agent/tabs';

export function AgentSettings({ agentId }: { agentId: string }) {
  const { agentTab, openAgentTab } = useNav();
  const role = useAgentRole(agentId);
  const flags = useMemberFlags(agentId, role.data?.isOwner ?? true);

  const back = () => openAgentTab(null);

  if (role.error && !role.data) {
    return (
      <>
        <AgentTabList agent={null} tabs={[]} active="profile" onPick={() => undefined} onBack={back} />
        <div style={{ flex: 1, background: C.bg }}><Center><div style={{ maxWidth: 380 }}><ErrorText>{role.error}</ErrorText></div></Center></div>
      </>
    );
  }
  if (!role.data) {
    return (
      <>
        <AgentTabList agent={null} tabs={[]} active="profile" onPick={() => undefined} onBack={back} />
        <div style={{ flex: 1, background: C.bg }}><Center><Spinner size={26} /></Center></div>
      </>
    );
  }

  const ctx = role.data;
  const tabs = tabsFor(ctx, flags.data);
  const wanted = (agentTab ?? 'profile') as TabKey;
  // If the open tab is not one this person has (for example it was switched off meanwhile), land on the profile.
  const active: TabKey = tabs.some((t) => t.key === wanted) ? wanted : 'profile';

  return (
    <>
      <AgentTabList agent={ctx.agent} tabs={tabs} active={active} onPick={(k) => openAgentTab(k)} onBack={back} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        <AgentContent key={`${agentId}:${active}`} tab={active} agentId={agentId} ctx={ctx} />
      </div>
    </>
  );
}
