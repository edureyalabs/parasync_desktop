// app/(shell)/requests/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Card, CardTitle, Chip, EmptyState, PageLoading } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate } from '@/components/account/format';
import { AgentPage } from '@/components/agent-ui/AgentPage';
import { AcceptedCard, InviteCard } from '@/components/requests/InviteCard';
import type { MyInvite } from '@/components/requests/types';

// Invitations addressed to you. A pending one is answered here: enter the code its sender gave you to accept (the agent
// then shows up in My Agents), or decline. Settled ones are kept below as a short history. No "open" link on those on
// purpose: an invite accepted a while ago does not guarantee the connection is still live (you may have removed the agent
// since), so the current state of a connection lives in My Agents itself.

const TONE: Record<MyInvite['status'], 'green' | 'neutral' | 'red' | 'brass'> = { pending: 'brass', redeemed: 'green', revoked: 'neutral', rejected: 'red' };
const LABEL: Record<MyInvite['status'], string> = { pending: 'Waiting', redeemed: 'Accepted', revoked: 'Cancelled by sender', rejected: 'Declined' };

export default function RequestsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<MyInvite[]>([]);
  const [justAccepted, setJustAccepted] = useState<string[]>([]);   // invite ids accepted in this visit

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }
      const { data } = await supabase.from('my_agent_invites').select('*').order('created_at', { ascending: false });
      setInvites((data as MyInvite[] | null) ?? []);
      setLoading(false);
    })();
  }, [router]);

  const { pending, accepted, past } = useMemo(() => ({
    pending: invites.filter(i => i.status === 'pending'),
    accepted: invites.filter(i => justAccepted.includes(i.id)),
    past: invites.filter(i => i.status !== 'pending' && !justAccepted.includes(i.id)),
  }), [invites, justAccepted]);

  const onAccepted = (agentId: string) => {
    // The RPC answers with the agent's id, not the invite's: settle the pending invite for that agent.
    const invite = invites.find(i => i.agent_id === agentId && i.status === 'pending');
    setInvites(prev => prev.map(i => (i.agent_id === agentId && i.status === 'pending' ? { ...i, status: 'redeemed', redeemed_at: new Date().toISOString() } : i)));
    if (invite) setJustAccepted(prev => [...prev, invite.id]);
  };
  const onDeclined = (id: string) => setInvites(prev => prev.map(i => (i.id === id ? { ...i, status: 'rejected' } : i)));

  if (loading) return <AgentPage eyebrow="Requests" title="Invitations" maxWidth={820}><PageLoading /></AgentPage>;

  return (
    <AgentPage
      eyebrow="Requests"
      title="Invitations"
      subtitle="Private agents you have been invited to use. Enter the code the sender gave you to accept."
      maxWidth={820}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {invites.length === 0 && (
          <Card pad="0">
            <EmptyState
              icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="16" height="12" rx="2" /><path d="M3.5 6.5 11 12l7.5-5.5" /></svg>}
              title="No invitations yet"
              action={<Link href="/marketplace" style={{ fontSize: '0.82rem', color: C.ink, fontWeight: 500, textDecoration: 'underline' }}>Browse public agents</Link>}
            >
              When someone invites you to use a private agent, it shows up here. You can also add public agents yourself from the Marketplace.
            </EmptyState>
          </Card>
        )}

        {accepted.map(i => <AcceptedCard key={i.id} invite={i} />)}
        {pending.map(i => <InviteCard key={i.id} invite={i} onAccepted={onAccepted} onDeclined={onDeclined} />)}
        {invites.length > 0 && pending.length === 0 && accepted.length === 0 && (
          <p style={{ fontSize: '0.84rem', color: C.soft, margin: 0 }}>You have no invitations waiting.</p>
        )}

        {past.length > 0 && (
          <Card pad="0" style={{ overflow: 'hidden', marginTop: '0.4rem' }}>
            <div style={{ padding: '1.1rem 1.4rem 0.8rem' }}><CardTitle>Earlier invitations</CardTitle></div>
            {past.map(i => (
              <div key={i.id} className="ac-row" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.8rem 1.4rem', borderTop: `1px solid ${C.lineSoft}`, flexWrap: 'wrap' }}>
                <AgentAvatar name={i.agent_name} size={34} />
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <p style={{ fontSize: '0.84rem', color: C.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.agent_name}</p>
                  <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, margin: '2px 0 0' }}>{i.org_name} · {fmtDate(i.redeemed_at ?? i.created_at)}</p>
                </div>
                <Chip tone={TONE[i.status]}>{LABEL[i.status]}</Chip>
              </div>
            ))}
          </Card>
        )}
      </div>
    </AgentPage>
  );
}
