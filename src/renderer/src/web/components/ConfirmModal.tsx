// components/ConfirmModal.tsx
'use client';

import { useEffect, useRef } from 'react';

function Spinner() {
  return (
    <>
      <div style={{ width: 14, height: 14, border: '1.5px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// Shared confirmation dialog for any destructive/hard-to-undo action —
// tool/instruction/secret deletion, leaving an agent, cancelling an invite,
// etc. Replaces both one-click instant deletes and the browser's native
// confirm() with a consistent in-app modal.
export default function ConfirmModal({
  eyebrow = 'This cannot be undone',
  title,
  message,
  confirmLabel = 'Delete',
  pendingLabel = 'Deleting…',
  loading = false,
  onClose,
  onConfirm,
}: {
  eyebrow?:      string;
  title:         string;
  message:       string;
  confirmLabel?: string;
  pendingLabel?: string;
  loading?:      boolean;
  onClose:       () => void;
  onConfirm:     () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current && !loading) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#B34A3C', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
          {eyebrow}
        </p>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: '0 0 0.75rem' }}>
          {title}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#67655A', lineHeight: 1.6, margin: 0 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 4 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ background: '#B34A3C', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {loading && <Spinner />}
            {loading ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
