// src/renderer/src/views/account/AppPage.tsx
import { useState } from 'react';

import { Button, Chip } from '@/components/ui';
import { Fact, Panel, TabPage } from '@/components/agent/kit';
import { useUpdates } from '@/hooks/useUpdates';
import { useAuth } from '@/lib/auth';

export function AppPage() {
  const { signOut } = useAuth();
  const { status, info, check, install } = useUpdates();
  const [signingOut, setSigningOut] = useState(false);

  const line =
    status.state === 'checking' ? 'Checking…'
    : status.state === 'available' ? `Version ${status.version} found, downloading…`
    : status.state === 'downloading' ? `Downloading ${status.percent}%`
    : status.state === 'ready' ? `Version ${status.version} is ready`
    : status.state === 'error' ? 'Could not check for updates'
    : status.state === 'unsupported' ? 'Only the installed app checks for updates'
    : 'You’re up to date';

  return (
    <TabPage title="This app" subtitle="The Parasync desktop app on this PC.">
      <Panel title="Version and updates">
        <Fact label="Version" value={info?.version ?? '—'} />
        <Fact label="Updates" value={line} />
        <Fact last label="Sign-in storage" value={info ? (info.secureStorage ? <Chip label="Encrypted by Windows" tone="green" /> : <Chip label="Memory only" tone="brass" title="Windows encryption isn't available, so you'll sign in again each time" />) : '—'} />
        <div style={{ padding: '4px 18px 16px', display: 'flex', gap: 10 }}>
          {status.state === 'ready'
            ? <Button label="Restart to update" onClick={install} />
            : <Button variant="secondary" icon="refresh" label="Check for updates" onClick={check} loading={status.state === 'checking'} disabled={status.state === 'downloading'} />}
        </div>
      </Panel>
      <Panel title="Session">
        <div style={{ padding: 18 }}><Button variant="danger" icon="logout" label="Sign out" loading={signingOut} onClick={() => { setSigningOut(true); void signOut(); }} /></div>
      </Panel>
    </TabPage>
  );
}
