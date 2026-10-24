// components/agent-access/AccessOverview.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Card, Chip, Stat } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtUsd } from '@/components/account/format';
import type { NetworkSummary, Visibility } from './types';

// The top of Add Users: what kind of agent this is (fixed when it was created), how people get access to it, and the
// numbers that matter at a glance.

const KIND: Record<Visibility, { title: string; body: string; steps: string[] }> = {
  personal: {
    title: 'Personal agent',
    body: 'Only you and your organization can use this agent.',
    steps: [],
  },
  private: {
    title: 'Private agent',
    body: 'Shared by invitation only. People you invite can chat with it from their own My Agents list.',
    steps: [
      'Enter their email address to create an invite.',
      'Send them the code yourself, by message or in person. It is never shown to them on the platform.',
      'They open Requests, enter the code and accept. The agent appears in their My Agents.',
    ],
  },
  public: {
    title: 'Public agent',
    body: 'Listed on the Marketplace. Anyone on the platform can add it to their network with one click.',
    steps: [],
  },
};

function kindChip(visibility: Visibility, verified: boolean) {
  if (visibility === 'personal') return <Chip>Personal</Chip>;
  if (visibility === 'private') return <Chip tone="brass">Private</Chip>;
  return verified ? <Chip tone="green" dot>Public · verified</Chip> : <Chip tone="amber" dot>Public · in review</Chip>;
}

export function AccessOverview({ visibility, verified, summary, pendingInvites, loading, children }: {
  visibility: Visibility; verified: boolean; summary: NetworkSummary; pendingInvites: number; loading: boolean; children?: ReactNode;
}) {
  const kind = KIND[visibility];
  const shared = visibility !== 'personal';
  const [showSteps, setShowSteps] = useState(false);

  return (
    <Card pad="0" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0, color: C.ink }}>{kind.title}</h2>
          {kindChip(visibility, verified)}
          {kind.steps.length > 0 && (
            <button type="button" onClick={() => setShowSteps(v => !v)} aria-expanded={showSteps}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: '0.66rem', color: C.brassDeep, padding: 0 }}>
              {showSteps ? 'Hide how it works' : 'How it works'}
            </button>
          )}
        </div>
        <p style={{ fontSize: '0.8rem', color: C.soft, lineHeight: 1.6, margin: '0.4rem 0 0', maxWidth: 640 }}>
          {kind.body} <span style={{ color: C.muted }}>Chosen when the agent was created.</span>
        </p>
        {showSteps && (
          <ol style={{ margin: '0.9rem 0 0', padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem 1.5rem' }}>
            {kind.steps.map((st, i) => (
              <li key={st} style={{ display: 'flex', gap: '0.7rem' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.brassWash, border: `1px solid ${C.brassLine}`, color: C.brassDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '0.62rem', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: '0.76rem', color: C.body, lineHeight: 1.55 }}>{st}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {shared && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', borderTop: `1px solid ${C.lineSoft}`, background: C.paper }}>
          <div style={{ padding: '0.75rem 1.4rem' }}><Stat label="Active users" value={loading ? '–' : summary.active} valueSize="1.2rem" /></div>
          <div style={{ padding: '0.75rem 1.4rem', borderLeft: `1px solid ${C.lineSoft}` }}><Stat label="Paused" value={loading ? '–' : summary.paused} valueSize="1.2rem" tone={summary.paused > 0 ? 'amber' : undefined} /></div>
          {visibility === 'private' && (
            <div style={{ padding: '0.75rem 1.4rem', borderLeft: `1px solid ${C.lineSoft}` }}><Stat label="Invites waiting" value={pendingInvites} valueSize="1.2rem" /></div>
          )}
          <div style={{ padding: '0.75rem 1.4rem', borderLeft: `1px solid ${C.lineSoft}` }}>
            <Stat label={`Their usage · ${summary.windowDays} days`} value={loading ? '–' : fmtUsd(summary.totals.cost)} valueSize="1.2rem"
              sub={loading ? undefined : `${summary.totals.calls.toLocaleString()}${summary.truncated ? '+' : ''} model call${summary.totals.calls === 1 ? '' : 's'}`} />
          </div>
        </div>
      )}
      {children}
    </Card>
  );
}
