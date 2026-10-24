// src/renderer/src/views/AboutPage.tsx
// Desktop-only: the app's version, updates and the way to close the session. Reached from the version label on the left strip.
import { useState } from 'react';

import { Button } from '~/components/ui';
import { LocalExecutionCard } from '~/components/LocalExecutionCard';
import { useUpdates } from '~/hooks/useUpdates';
import { useAuth } from '~/lib/auth';
import { useRouter } from '~/shims/nextNavigation';

const row = { display: 'flex', justifyContent: 'space-between', gap: 24, padding: '11px 18px', borderBottom: '1px solid #E2DFD3', fontSize: 13.5 } as const;

export function AboutPage() {
  const { signOut } = useAuth();
  const router = useRouter();
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
    <div style={{ flex: 1, background: '#F7F6F2', overflowY: 'auto', padding: '40px 24px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <button onClick={() => router.push('/agents')} style={{ border: 'none', background: 'none', color: '#67655A', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 14 }}>← Back</button>
        <h1 style={{ margin: '0 0 4px', fontFamily: "'Newsreader', Georgia, serif", fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>Parasync for Windows</h1>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#9E9C8F' }}>About this app.</p>
        <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 10, overflow: 'hidden' }}>
          <div style={row}><span style={{ color: '#9E9C8F' }}>Version</span><span>{info?.version ?? '—'}</span></div>
          <div style={row}><span style={{ color: '#9E9C8F' }}>Updates</span><span>{line}</span></div>
          <div style={{ ...row, borderBottom: 'none' }}><span style={{ color: '#9E9C8F' }}>Sign-in storage</span><span>{info ? (info.secureStorage ? 'Encrypted by Windows' : 'Memory only') : '—'}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {status.state === 'ready'
            ? <Button label="Restart to update" onClick={install} />
            : <Button variant="secondary" label="Check for updates" onClick={check} loading={status.state === 'checking'} disabled={status.state === 'downloading'} />}
          <Button variant="secondary" label="Sign out" loading={signingOut} onClick={() => { setSigningOut(true); void signOut(); }} />
        </div>
        <LocalExecutionCard />
      </div>
    </div>
  );
}
