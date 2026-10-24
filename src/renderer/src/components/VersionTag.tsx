// src/renderer/src/components/VersionTag.tsx
import { useEffect, useState } from 'react';

import { usePathname, useRouter } from '~/shims/nextNavigation';

/** A small version label at the foot of the left strip. It opens the app's About page (version, updates, sign out). */
export function VersionTag() {
  const [version, setVersion] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { void window.parasync.info().then((i) => setVersion(i.version)).catch(() => undefined); }, []);
  if (!version) return null;
  return (
    <button
      onClick={() => router.push(pathname === '/desktop' ? '/agents' : '/desktop')} title="About this app and updates" aria-label="About this app"
      style={{ position: 'fixed', left: 0, bottom: 0, width: 68, height: 18, zIndex: 50, border: 'none', background: 'transparent', color: '#6F6C5E', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, cursor: 'pointer', padding: 0 }}
    >
      v{version}
    </button>
  );
}
