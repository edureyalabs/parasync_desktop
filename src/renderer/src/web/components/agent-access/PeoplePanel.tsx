// components/agent-access/PeoplePanel.tsx
'use client';

import { useState } from 'react';
import { C, MONO } from '@/components/account/tokens';
import { ConnectedUsers } from './ConnectedUsers';
import { InviteList } from './InviteList';
import type { Connection, Invite, NetworkSummary } from './types';

// The body of the private-agent card: a two-way switch between the people who have joined and the invites sent. Only the
// visible list renders, so opening the tab costs one small page of people, not everything.

type Tab = 'people' | 'invites';

export function PeoplePanel({ summary, invites, loadingUsers, loadingInvites, hasMore, loadingMore, onLoadMore, onSetStatus, onCancelInvite }: {
  summary: NetworkSummary; invites: Invite[]; loadingUsers: boolean; loadingInvites: boolean;
  hasMore: boolean; loadingMore: boolean; onLoadMore: () => void;
  onSetStatus: (c: Connection, next: 'active' | 'paused') => Promise<string | null>;
  onCancelInvite: (i: Invite) => void;
}) {
  const [tab, setTab] = useState<Tab>('people');
  const pending = invites.filter(i => i.status === 'pending').length;

  const tabs: { key: Tab; label: string; count: string }[] = [
    { key: 'people', label: 'Connected users', count: loadingUsers ? '' : String(summary.total) },
    { key: 'invites', label: 'Invites', count: loadingInvites ? '' : pending > 0 ? `${pending} waiting` : String(invites.length) },
  ];

  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      <div role="tablist" aria-label="People and invites" style={{ display: 'flex', gap: '0.25rem', padding: '0.5rem 1rem 0' }}>
        {tabs.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => setTab(t.key)}
              style={{ background: 'none', border: 'none', borderBottom: `2px solid ${on ? C.brassDeep : 'transparent'}`, cursor: 'pointer', padding: '0.55rem 0.5rem', margin: '0 0.35rem', fontSize: '0.82rem', fontWeight: on ? 500 : 400, color: on ? C.ink : C.soft, display: 'flex', alignItems: 'center', gap: '0.45rem', fontFamily: 'inherit' }}>
              {t.label}
              {t.count && <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: on ? C.brassDeep : C.muted }}>{t.count}</span>}
            </button>
          );
        })}
      </div>
      {tab === 'people' ? (
        <ConnectedUsers
          connections={summary.connections} loading={loadingUsers} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore}
          windowDays={summary.windowDays} truncated={summary.truncated} onSetStatus={onSetStatus}
        />
      ) : (
        <InviteList invites={invites} loading={loadingInvites} onCancel={onCancelInvite} />
      )}
    </div>
  );
}
