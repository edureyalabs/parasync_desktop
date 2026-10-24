// components/agent-profile/ProfileHero.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Btn, Card, Chip } from '@/components/account/ui';
import { Icon } from '@/components/icons/Icon';
import { copyText } from '@/components/agent-ui/clipboard';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate } from '@/components/account/format';
import type { AgentSummary } from './useAgentSummary';

// The top of the owner's Agent Profile: the photo, the saved name, the permanent @handle (click to copy), the bio and the agent's state (kind, active, plan).
// The name and bio are edited in the form below; this shows what is saved.

function planChip(summary: AgentSummary, loading: boolean) {
  const s = summary.subscription;
  if (loading || !s) return null;
  if (s.state === 'free') return <Chip>No plan needed</Chip>;
  if (s.state === 'active') return <Chip tone="green" dot>Plan active{s.daysLeft !== null ? ` · ${s.daysLeft} days left` : ''}</Chip>;
  if (s.state === 'expiring') return <Chip tone="amber" dot>Renews in {s.daysLeft} day{s.daysLeft === 1 ? '' : 's'}</Chip>;
  if (s.state === 'expired') return <Chip tone="red" dot>Plan expired</Chip>;
  return <Chip tone="red" dot>Not subscribed</Chip>;
}

export function ProfileHero({ name, bio, handle, orgName, avatarUrl, kind, active, summary, summaryLoading, busy, error, onChangePhoto, onRemovePhoto }: {
  name: string; bio: string | null; handle?: string; orgName?: string; avatarUrl: string | null;
  kind: ReactNode; active: boolean; summary: AgentSummary; summaryLoading: boolean;
  busy: boolean; error: string; onChangePhoto: () => void; onRemovePhoto: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { if (handle && await copyText(`@${handle}`)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  return (
    <Card pad="1.3rem 1.5rem">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <AgentAvatar name={name || 'Agent'} avatarUrl={avatarUrl} size={76} fontSize="1.2rem" ring ringGap="#fff" />
          <button
            type="button" onClick={onChangePhoto} disabled={busy} aria-label={avatarUrl ? 'Change photo' : 'Add a photo'} title={avatarUrl ? 'Change photo' : 'Add a photo'}
            style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: '50%', border: `2px solid #fff`, background: C.ink, color: '#F7F6F2', display: 'grid', placeItems: 'center', cursor: busy ? 'wait' : 'pointer', padding: 0 }}
          ><Icon name="camera" size={12} /></button>
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.45rem', fontWeight: 500, letterSpacing: '-0.015em', color: '#514726', margin: 0, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{name}</h2>
          {handle && (
            <button type="button" onClick={copy} title="Copy the agent’s permanent ID" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', border: 'none', background: 'transparent', padding: 0, margin: '0.15rem 0 0', cursor: 'pointer', fontFamily: MONO, fontSize: '0.74rem', color: C.soft }}>
              @{handle}<Icon name={copied ? 'check' : 'copy'} size={12} />
            </button>
          )}
          {bio && <p style={{ fontSize: '0.84rem', color: C.body, margin: '0.45rem 0 0', lineHeight: 1.55, maxWidth: 560 }}>{bio}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
            {kind}
            <Chip tone={active ? 'green' : 'neutral'} dot>{active ? 'Active' : 'Switched off'}</Chip>
            {planChip(summary, summaryLoading)}
            {(orgName || summary.createdAt) && <span style={{ fontSize: '0.72rem', color: C.muted }}>{[orgName, summary.createdAt ? `Created ${fmtDate(summary.createdAt)}` : ''].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
        {avatarUrl && <Btn size="sm" disabled={busy} onClick={onRemovePhoto} style={{ color: C.red }}>Remove photo</Btn>}
      </div>
      {error && <p role="alert" style={{ fontSize: '0.75rem', color: C.red, margin: '0.8rem 0 0' }}>{error}</p>}
    </Card>
  );
}

