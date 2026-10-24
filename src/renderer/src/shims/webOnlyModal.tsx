// src/renderer/src/shims/webOnlyModal.tsx
// Payments are made on the web, never in the desktop app (the card checkout is a web-only script). The web's two payment pop-ups are
// swapped for this one, which says so and opens the right page of the web app.
import type { ReactNode } from 'react';

export function WebOnlyModal({ title, children, webPath, onClose }: { title: string; children: ReactNode; webPath: string; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 440, fontFamily: "'Inter', sans-serif", color: '#26251E' }}>
        <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.02em' }}>{title}</h2>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', lineHeight: 1.6, color: '#67655A' }}>{children}</p>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', cursor: 'pointer', borderRadius: 4 }}>Close</button>
          <button
            onClick={() => { void window.parasync.openExternal(`https://parasync.in${webPath}`).catch(() => undefined); onClose(); }}
            style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.1rem', fontSize: '0.825rem', cursor: 'pointer', borderRadius: 4 }}
          >
            Continue on the web
          </button>
        </div>
      </div>
    </div>
  );
}
