// components/notifications/NotificationBell.tsx
'use client';

import { useCallback, useState } from 'react';
import { NotificationsModal } from './NotificationsModal';
import { useNotifications } from './useNotifications';

// The bell in the chat header: a live unread badge, and the notification wall behind it.
// Owns the feed's data hook, so the badge stays current (realtime) even while the wall is
// closed. Render it with `key={agentId}` so switching agents starts from a clean state.

export function NotificationBell({ agentId, agentName }: { agentId: string; agentName: string }) {
  const state = useNotifications(agentId);
  const { unread, clearFresh } = state;
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    clearFresh();
  }, [clearFresh]);

  const badge = unread > 99 ? '99+' : String(unread);
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    // The header behind this is itself clickable (it opens the agent's profile/config), so
    // nothing that happens in the bell or its modal may bubble up to it.
    <div style={{ position: 'relative', display: 'flex' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        title="Notifications" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        style={{
          position: 'relative', width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hover || open ? '#F3F1E8' : 'transparent',
          border: '1px solid transparent',
          color: unread > 0 ? '#7C5F27' : '#67655A', transition: 'background 0.15s, color 0.15s',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 11.5h9l-1.1-1.6V7a3.4 3.4 0 0 0-6.8 0v2.9L3.5 11.5Z" />
          <path d="M6.6 13.4a1.5 1.5 0 0 0 2.8 0" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 1, right: 0, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box',
              borderRadius: 8, background: '#A17F3A', color: '#fff', border: '2px solid #fff',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.56rem', lineHeight: '12px', textAlign: 'center',
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && <NotificationsModal agentId={agentId} agentName={agentName} state={state} onClose={close} />}
    </div>
  );
}
