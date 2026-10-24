// src/renderer/src/shims/subscribeAgentModal.tsx
// Stands in for the web's "Subscribe an agent" pop-up (see webOnlyModal.tsx). It also exports the monthly price table the web's
// plan screens read; scripts/sync-web.ts warns if the web changes these numbers so this copy can be updated.
import { WebOnlyModal } from '~/shims/webOnlyModal';

export const MONTHLY_RATE_USD: Record<string, number> = { personal: 10, private: 20 };

export default function SubscribeAgentModal({ agentName, onClose }: { agentId?: string; agentName?: string; visibility?: string; onClose: () => void; onSubscribed?: () => void }) {
  return <WebOnlyModal title="Pay for a plan on the web" webPath="/account/organizations" onClose={onClose}>Plans are paid for in the Parasync web app{agentName ? `, including ${agentName}'s` : ''}. Open it to subscribe, then come back here: the plan shows up on its own.</WebOnlyModal>;
}
