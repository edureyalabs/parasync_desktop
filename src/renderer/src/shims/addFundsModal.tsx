// src/renderer/src/shims/addFundsModal.tsx
// Stands in for the web's "Add funds" pop-up (see webOnlyModal.tsx).
import { WebOnlyModal } from '~/shims/webOnlyModal';

export default function AddFundsModal({ onClose }: { currentBalance?: number; onClose: () => void; onFundsAdded?: () => void }) {
  return <WebOnlyModal title="Add funds on the web" webPath="/account/billing" onClose={onClose}>Payments are made in the Parasync web app. Open it to top up your wallet, then come back here: your balance updates on its own.</WebOnlyModal>;
}
