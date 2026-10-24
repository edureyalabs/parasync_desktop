// components/agent-access/ConnectedUsers.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Btn, Chip, EmptyState, Spinner } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate, fmtUsd } from '@/components/account/format';
import type { Connection } from './types';

// The people connected to a private agent, 20 at a time: the list scrolls inside its own container and fetches the next
// 20 as the bottom comes into view. Each row shows: who they are, how they got in, what they have been doing, and the one control
// the owner has (pause / resume). Pausing is a soft revoke: their history stays and they can be resumed any time.

const GRID = 'minmax(190px, 1.5fr) minmax(112px, 0.8fr) minmax(120px, 0.8fr) minmax(112px, 0.8fr) minmax(86px, 0.5fr) 80px';

function ago(iso: string | null): string {
  if (!iso) return 'No activity yet';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return 'Active just now';
  if (mins < 60) return `Active ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Active ${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days < 31 ? `Active ${days} day${days === 1 ? '' : 's'} ago` : `Last active ${fmtDate(iso)}`;
}

function Person({ c }: { c: Connection }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', background: C.brassWash, border: `1px solid ${C.brassLine}`, color: C.brassDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '0.8rem', flexShrink: 0, textTransform: 'uppercase' }}>{c.email.charAt(0)}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</p>
        <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, margin: '2px 0 0' }}>{ago(c.usage.lastActive)}</p>
      </div>
    </div>
  );
}

export function ConnectedUsers({ connections, loading, hasMore, loadingMore, onLoadMore, windowDays, truncated, onSetStatus }: {
  connections: Connection[]; loading: boolean; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void;
  windowDays: number; truncated: boolean;
  onSetStatus: (c: Connection, next: 'active' | 'paused') => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadRef = useRef(onLoadMore);
  useEffect(() => { loadRef.current = onLoadMore; });

  // Fetch the next page when the sentinel at the bottom of the list scrolls into view (observed relative to the list's
  // own scroll area, not the page). Re-armed after every page so a short page that doesn't fill the box keeps loading.
  useEffect(() => {
    const root = scroller.current;
    const target = sentinel.current;
    if (!root || !target || !hasMore || loadingMore) return;
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) loadRef.current(); }, { root, rootMargin: '0px 0px 160px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, [hasMore, loadingMore, connections.length]);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading connected users">
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.85rem 1.4rem', borderTop: `1px solid ${C.lineSoft}` }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.lineSoft }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 10, width: '34%', borderRadius: 4, background: C.lineSoft }} />
              <div style={{ height: 8, width: '18%', borderRadius: 4, background: C.lineSoft, marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <EmptyState
        icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="7.5" r="3.2" /><path d="M2 18c.8-3.2 3.3-5 6-5s5.2 1.8 6 5M15 4.6a3 3 0 0 1 0 5.8M17 13.4c1.7.7 2.8 2.2 3.2 4.6" /></svg>}
        title="Nobody is connected yet"
      >
        People you invite appear here once they accept, with how much they use the agent and a way to pause their access.
      </EmptyState>
    );
  }

  const toggle = async (c: Connection) => {
    setBusy(c.id); setError('');
    const err = await onSetStatus(c, c.status === 'active' ? 'paused' : 'active');
    setBusy(null);
    if (err) setError(err);
  };

  return (
    <>
      <div ref={scroller} style={{ maxHeight: 460, overflow: 'auto', borderTop: `1px solid ${C.line}` }}>
        <div style={{ minWidth: 820 }} role="table" aria-label="Connected users">
          <div role="row" style={{ position: 'sticky', top: 0, zIndex: 1, display: 'grid', gridTemplateColumns: GRID, gap: '0 1rem', padding: '0.5rem 1.4rem', background: C.surface, borderBottom: `1px solid ${C.line}` }}>
            {['User', 'Connected', `Usage · ${windowDays} days`, 'Scheduled work', 'Status', ''].map((h, i) => (
              <span key={i} role="columnheader" style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</span>
            ))}
          </div>
          {connections.map(c => (
            <div key={c.id} role="row" className="ac-row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 1rem', alignItems: 'center', padding: '0.65rem 1.4rem', borderBottom: `1px solid ${C.lineSoft}` }}>
              <div role="cell"><Person c={c} /></div>
              <div role="cell">
                <p style={{ fontSize: '0.8rem', color: C.body, margin: 0 }}>{fmtDate(c.connected_at)}</p>
                <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.source === 'invite' ? 'By invite' : 'From Marketplace'}</p>
              </div>
              <div role="cell">
                <p style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem', color: C.ink, margin: 0 }}>{fmtUsd(c.usage.cost)}</p>
                <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, margin: '2px 0 0' }}>{c.usage.calls.toLocaleString()}{truncated ? '+' : ''} call{c.usage.calls === 1 ? '' : 's'}</p>
              </div>
              <div role="cell">
                <p style={{ fontSize: '0.8rem', color: c.tasks.open > 0 ? C.ink : C.faint, margin: 0 }}>{c.tasks.open > 0 ? `${c.tasks.open} open task${c.tasks.open === 1 ? '' : 's'}` : 'Nothing queued'}</p>
                {c.tasks.recurring > 0 && <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, margin: '2px 0 0' }}>{c.tasks.recurring} recurring</p>}
              </div>
              <div role="cell"><Chip tone={c.status === 'active' ? 'green' : 'amber'} dot>{c.status === 'active' ? 'Active' : 'Paused'}</Chip></div>
              <div role="cell" style={{ textAlign: 'right' }}>
                <Btn size="sm" disabled={busy === c.id} onClick={() => void toggle(c)}>{busy === c.id ? '…' : c.status === 'active' ? 'Pause' : 'Resume'}</Btn>
              </div>
            </div>
          ))}
          <div ref={sentinel} style={{ height: 1 }} aria-hidden="true" />
          {loadingMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0.8rem' }}><Spinner size={16} /></div>
          )}
        </div>
      </div>
      {error && <p role="alert" style={{ fontSize: '0.78rem', color: C.red, margin: 0, padding: '0.6rem 1.4rem' }}>{error}</p>}
      <p style={{ fontSize: '0.7rem', color: C.muted, margin: 0, padding: '0.65rem 1.4rem', lineHeight: 1.55, background: C.paper, borderTop: `1px solid ${C.lineSoft}` }}>
        Pausing a user stops new messages being answered for them; their history stays and you can resume them any time. Usage is charged to your balance. Scheduled work shows counts only.
      </p>
    </>
  );
}
