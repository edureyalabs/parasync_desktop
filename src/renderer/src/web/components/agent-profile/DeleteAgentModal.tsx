// components/agent-profile/DeleteAgentModal.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Btn, Spinner } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';

// Deleting an agent is permanent, so the name has to be typed back to confirm.
export function DeleteAgentModal({ agentName, onClose, onConfirm }: {
  agentName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await onConfirm();
    } catch {
      setError('Failed to delete the agent. Please try again.');
      setDeleting(false);
    }
  };

  const matches = confirmText === agentName;

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current && !deleting) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="delete-agent-title" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '2rem', width: '100%', maxWidth: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <p style={{ fontFamily: MONO, fontSize: '0.68rem', color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>This cannot be undone</p>
        <h2 id="delete-agent-title" style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: C.ink, margin: '0 0 0.75rem' }}>Delete &ldquo;{agentName}&rdquo;?</h2>
        <p style={{ fontSize: '0.85rem', color: C.soft, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
          This permanently deletes the agent along with all of its chats, messages, tools, instructions, secrets and workspace files. Type <strong>{agentName}</strong> to confirm.
        </p>
        <input
          type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={agentName} aria-label="Type the agent's name to confirm"
          style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', fontSize: '0.875rem', fontFamily: "'Inter', sans-serif", color: C.ink, background: '#fff', border: '1px solid #DAD5C5', borderRadius: 6, outline: 'none' }}
        />
        {error && <p role="alert" style={{ fontSize: '0.8rem', color: C.red, margin: '0.9rem 0 0', background: C.redWash, border: `1px solid ${C.redLine}`, borderRadius: 6, padding: '0.5rem 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <Btn onClick={onClose} disabled={deleting}>Cancel</Btn>
          <Btn onClick={() => void handleDelete()} disabled={!matches || deleting} style={{ background: C.red, color: '#fff', borderColor: 'transparent' }}>
            {deleting && <Spinner size={14} color="#fff" />}
            {deleting ? 'Deleting…' : 'Delete agent'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
