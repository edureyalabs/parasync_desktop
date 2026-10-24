// components/agent-header/ComingSoon.tsx
'use client';

import type { ReactNode } from 'react';

// A tab whose feature is not open yet. The page underneath is shown for reading, but `inert` takes it out of reach
// completely (no clicks, no focus, no keyboard), and the note at the top says why. This is a front-end block only:
// the code behind the page and its API routes are untouched, so removing this wrapper turns the feature back on.
export function ComingSoon({ feature, children }: { feature: string; children: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: '#F7F6F2' }}>
      <div
        role="note"
        style={{
          margin: '1.25rem 2rem 0', maxWidth: 1200, padding: '0.7rem 1rem', borderRadius: 6,
          background: '#FBF3DD', border: '1px solid #E4D2A0', color: '#7C5F27', fontSize: '0.8rem', lineHeight: 1.55,
          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
        }}
      >
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.45rem', borderRadius: 3, background: '#EFE4C9', border: '1px solid #E4D2A0', flexShrink: 0, marginTop: 1 }}>
          Coming soon
        </span>
        <span><strong style={{ fontWeight: 600 }}>{feature}</strong> are currently disabled. You can look around to see what they will do, but nothing here can be connected or changed yet.</span>
      </div>
      <div inert aria-disabled="true" style={{ opacity: 0.62, userSelect: 'none' }}>
        {children}
      </div>
    </div>
  );
}
