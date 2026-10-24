// src/renderer/src/components/NotificationsPanel.tsx
import { useEffect, useRef } from 'react';

import { Icon } from '@/components/Icon';
import { Markdown } from '@/components/Markdown';
import { Button, Center, ErrorText, Spinner } from '@/components/ui';
import type { NotificationsState } from '@/hooks/useNotifications';
import { dayKey, dayLabel } from '@/lib/chatTime';
import { formatClock, formatRelative, kindStyle } from '@/lib/notificationKinds';
import { C, MONO } from '@/lib/theme';

/** The agent's notification feed (task, shift and project results), as a panel over the chat. */
export function NotificationsPanel({ agentName, state, onClose }: { agentName: string; state: NotificationsState; onClose: () => void }) {
  const { items, loading, loadingMore, hasMore, error, freshIds, loadMore, acknowledge, clearFresh } = state;
  const acknowledged = useRef(false);

  // Opening the feed marks everything read; the entries that were new stay highlighted until it closes.
  useEffect(() => {
    if (loading || acknowledged.current) return;
    acknowledged.current = true;
    void acknowledge();
  }, [loading, acknowledge]);
  useEffect(() => () => clearFresh(), [clearFresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const now = Date.now();
  return (
    <aside
      role="dialog" aria-label={`${agentName} notifications`}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '92%', background: C.bg, borderLeft: `1px solid ${C.line}`, boxShadow: '-8px 0 24px rgba(38,37,30,0.10)', display: 'flex', flexDirection: 'column', zIndex: 20 }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${C.line}`, background: '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Notifications</div>
          <div style={{ fontSize: 12, color: C.soft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Results from {agentName}</div>
        </div>
        <button onClick={onClose} aria-label="Close notifications" className="ps-hover" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={16} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <Center><Spinner size={24} /></Center>
        ) : error && items.length === 0 ? (
          <ErrorText>{error}</ErrorText>
        ) : items.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: C.soft, fontSize: 13, lineHeight: 1.6 }}>
            Nothing yet. When a task, shift or project finishes, its result lands here.
          </div>
        ) : (
          items.map((n, i) => {
            const k = kindStyle(n.kind);
            const fresh = freshIds.has(n.id);
            const newDay = i === 0 || dayKey(items[i - 1]!.created_at) !== dayKey(n.created_at);
            return (
              <div key={n.id}>
                {newDay && <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.soft, margin: '6px 2px 8px' }}>{dayLabel(n.created_at)}</div>}
                <article style={{ background: '#fff', border: `1px solid ${fresh ? C.brassLine : C.line}`, boxShadow: fresh ? `0 0 0 3px ${C.brassBg}` : undefined, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: k.fg, background: k.bg, border: `1px solid ${k.border}`, borderRadius: 4, padding: '2px 6px' }}>{k.label}</span>
                    <span style={{ fontSize: 11.5, color: C.soft }} title={new Date(n.created_at).toLocaleString()}>{formatClock(n.created_at)} · {formatRelative(n.created_at, now)}</span>
                  </div>
                  {n.task_label && <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 4 }}>{n.task_label}</div>}
                  <Markdown>{n.body}</Markdown>
                  {(n.attachments?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {n.attachments!.map((f) => (
                        <span key={f.path} style={{ fontSize: 11.5, color: C.muted, background: C.sunken, border: `1px solid ${C.line}`, borderRadius: 5, padding: '2px 7px' }}>📎 {f.filename}</span>
                      ))}
                    </div>
                  )}
                  {n.kind === 'project_question' && !n.replied_at && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#5B4B8A' }}>This question needs an answer. Reply to it in the web app for now.</div>
                  )}
                </article>
              </div>
            );
          })
        )}
        {hasMore && !loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 10px' }}>
            <Button variant="secondary" label="Load older" loading={loadingMore} onClick={() => void loadMore()} />
          </div>
        )}
        {error && items.length > 0 && <ErrorText>{error}</ErrorText>}
      </div>
    </aside>
  );
}
