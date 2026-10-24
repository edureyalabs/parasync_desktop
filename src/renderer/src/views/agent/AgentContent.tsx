// src/renderer/src/views/agent/AgentContent.tsx
import { BrowserAccessTab } from '@/views/agent/BrowserAccessTab';
import { EmailTab } from '@/views/agent/EmailTab';
import { InstructionsTab } from '@/views/agent/InstructionsTab';
import { McpTab } from '@/views/agent/McpTab';
import { MyKeysTab } from '@/views/agent/MyKeysTab';
import { NetworkTab } from '@/views/agent/NetworkTab';
import { PlatformToolsTab } from '@/views/agent/PlatformToolsTab';
import { ProfileTab } from '@/views/agent/ProfileTab';
import { RunsheetTab } from '@/views/agent/RunsheetTab';
import { SecretsTab } from '@/views/agent/SecretsTab';
import { SignedApisTab } from '@/views/agent/SignedApisTab';
import { ToolsTab } from '@/views/agent/ToolsTab';
import { WhatsAppTab } from '@/views/agent/WhatsAppTab';
import { WorkspaceTab } from '@/views/agent/WorkspaceTab';
import type { TabKey } from '@/views/agent/tabs';
import type { TabProps } from '@/views/agent/types';

export function AgentContent({ tab, ...props }: TabProps & { tab: TabKey }) {
  switch (tab) {
    case 'runsheet': return <RunsheetTab {...props} />;
    case 'platform-tools': return <PlatformToolsTab {...props} />;
    case 'email': return <EmailTab {...props} />;
    case 'whatsapp': return <WhatsAppTab {...props} />;
    case 'tools': return <ToolsTab {...props} />;
    case 'instructions': return <InstructionsTab {...props} />;
    case 'secrets': return <SecretsTab {...props} />;
    case 'signed-apis': return <SignedApisTab {...props} />;
    case 'mcp': return <McpTab {...props} />;
    case 'browser-access': return <BrowserAccessTab {...props} />;
    case 'network': return <NetworkTab {...props} />;
    case 'workspace': return <WorkspaceTab {...props} />;
    case 'keys': return <MyKeysTab {...props} />;
    default: return <ProfileTab {...props} />;
  }
}
