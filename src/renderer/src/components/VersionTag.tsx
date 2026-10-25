// src/renderer/src/components/VersionTag.tsx
import { useEffect, useState } from 'react';

import { usePathname, useRouter } from '~/shims/nextNavigation';

/**
 * The version label at the foot of the left strip. It sits well below the sign-out button, behind a thin line, so the two are not mistaken
 * for each other. It opens the app's About page (also reachable from Account → About this app).
 */
export function VersionTag() {
  const [version, setVersion] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { void window.parasync.info().then((i) => setVersion(i.version)).catch(() => undefined); }, []);
  if (!version) return null;
  return (
    <div style={{ position: 'fixed', left: 0, bottom: 0, width: 68, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 6 }}>
      <div aria-hidden style={{ width: 28, height: 1, background: '#3A382E', marginBottom: 6 }} />
      <button
        onClick={() => router.push(pathname === '/desktop' ? '/agents' : '/desktop')} title="About this app and updates" aria-label="About this app"
        style={{ width: 52, height: 22, border: 'none', background: 'transparent', color: '#6F6C5E', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, cursor: 'pointer', padding: 0 }}
      >
        v{version}
      </button>
    </div>
  );
}
