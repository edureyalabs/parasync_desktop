// app/(shell)/agents/[id]/network/page.tsx
'use client';

import { useState } from 'react';
import { useAgentCtx } from '../layout';
import ConfirmModal from '@/components/ConfirmModal';
import { Card, EmptyState } from '@/components/account/ui';
import { C } from '@/components/account/tokens';
import { AgentPage } from '@/components/agent-ui/AgentPage';
import { AccessOverview } from '@/components/agent-access/AccessOverview';
import { InviteForm } from '@/components/agent-access/InviteForm';
import { PeoplePanel } from '@/components/agent-access/PeoplePanel';
import type { Invite, Visibility } from '@/components/agent-access/types';
import { useAgentAccess } from '@/components/agent-access/useAgentAccess';

// The "Add Users" tab (route still /network): who else can reach this agent. Private agents are shared by invite, public
// ones by the Marketplace (so only totals are shown, never who), personal ones are not shared at all.
export default function AddUsersPage() {
  const { agent, agentId } = useAgentCtx();
  const visibility: Visibility = agent?.visibility ?? 'personal';
  const access = useAgentAccess(agentId, visibility === 'private');
  const [cancelTarget, setCancelTarget] = useState<Invite | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  if (!agent) return <AgentPage eyebrow="Add users" title="Who can use this agent"><div /></AgentPage>;

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true); setCancelError('');
    const err = await access.cancelInvite(cancelTarget);
    setCancelling(false);
    if (err) { setCancelError(err); return; }
    setCancelTarget(null);
  };

  return (
    <AgentPage
      eyebrow="Add users"
      title="Who can use this agent"
      subtitle={visibility === 'private' ? 'Invite people by email and manage the ones who have joined.' : visibility === 'public' ? 'This agent is on the Marketplace, so people add themselves.' : 'Access to this agent.'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {visibility === 'private' && <InviteForm onSend={access.sendInvite} />}

        {access.loadError && (
          <p role="alert" style={{ fontSize: '0.8rem', color: C.red, background: C.redWash, border: `1px solid ${C.redLine}`, borderRadius: 8, padding: '0.7rem 1rem', margin: 0 }}>
            {access.loadError} <button onClick={() => void access.reload()} style={{ background: 'none', border: 'none', color: C.red, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}>Try again</button>
          </p>
        )}

        <AccessOverview
          visibility={visibility} verified={agent.is_verified} summary={access.summary}
          pendingInvites={access.invites.filter(i => i.status === 'pending').length} loading={access.loadingUsers}
        >
          {visibility === 'private' && (
            <PeoplePanel
              summary={access.summary} invites={access.invites} loadingUsers={access.loadingUsers} loadingInvites={access.loadingInvites}
              hasMore={access.hasMore} loadingMore={access.loadingMore} onLoadMore={() => void access.loadMore()}
              onSetStatus={access.setStatus} onCancelInvite={i => { setCancelError(''); setCancelTarget(i); }}
            />
          )}
        </AccessOverview>

        {visibility === 'personal' && (
          <Card pad="0">
            <EmptyState
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="7.5" r="3.4" /><path d="M4.5 18c.9-3.4 3.6-5.4 6.5-5.4s5.6 2 6.5 5.4" /></svg>}
              title="This agent is just for your organization"
            >
              Personal agents can&apos;t be shared with other users. To share an agent, create a new one and choose Private or Public when you set it up.
            </EmptyState>
          </Card>
        )}

        {visibility === 'public' && (
          <Card>
            <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: '0 0 0.4rem' }}>Who is connected</p>
            <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0, lineHeight: 1.65, maxWidth: 620 }}>
              {!access.loadingUsers && access.summary.total === 0
                ? 'Nobody has added this agent from the Marketplace yet.'
                : 'Anyone on the platform can add a public agent from the Marketplace, so individual people are not listed here. The counts above show how many are connected and how much they use it.'}
            </p>
          </Card>
        )}
      </div>

      {cancelTarget && (
        <ConfirmModal
          eyebrow="Cancel this invite"
          title={`Cancel the invite to ${cancelTarget.invited_email}?`}
          message={cancelError || "They'll no longer be able to redeem the code you shared with them. You can send a new invite to this address later if you change your mind."}
          confirmLabel="Cancel invite"
          pendingLabel="Cancelling…"
          loading={cancelling}
          onClose={() => setCancelTarget(null)}
          onConfirm={confirmCancel}
        />
      )}
    </AgentPage>
  );
}
