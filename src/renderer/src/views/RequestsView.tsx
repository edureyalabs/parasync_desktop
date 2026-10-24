// src/renderer/src/views/RequestsView.tsx
import { useCallback, useEffect, useState } from 'react';

import { Avatar, Button, Card, Center, Chip, EmptyState, ErrorText, PageHeader, Spinner } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { useNav } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';
import type { MyInvite } from '@/lib/types';

const TONE = { pending: 'brass', redeemed: 'green', revoked: 'neutral', rejected: 'red' } as const;
const LABEL = { pending: 'Pending', redeemed: 'Accepted', revoked: 'Cancelled', rejected: 'Declined' } as const;

function InviteCard({ invite, onChanged }: { invite: MyInvite; onChanged: () => void }) {
  const { openAgent } = useNav();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    const c = code.trim();
    if (!c) { setError('Enter the code the sender gave you.'); return; }
    setBusy('accept'); setError(null);
    const { data, error: err } = await supabase.rpc('redeem_agent_invite', { p_code: c });
    setBusy(null);
    if (err) { setError('That code did not work. Check it and try again.'); return; }
    onChanged();
    if (typeof data === 'string') openAgent(data);
  };

  const decline = async () => {
    setBusy('decline'); setError(null);
    const { error: err } = await supabase.rpc('reject_agent_invite', { p_invite_id: invite.id });
    setBusy(null);
    if (err) setError('Could not decline. Please try again.');
    else onChanged();
  };

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={invite.agent_name} size={42} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{invite.agent_name}</div>
          <div style={{ fontSize: 12.5, color: C.soft }}>Invited by {invite.org_name} · {fmtDate(invite.created_at)}</div>
        </div>
      </div>
      <input
        value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invitation code" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="Invitation code"
        onKeyDown={(e) => { if (e.key === 'Enter') void accept(); }}
        style={{ height: 40, border: `1px solid ${C.lineStrong}`, borderRadius: 8, padding: '0 12px', fontFamily: MONO, fontSize: 13, color: C.ink, background: C.bg, outline: 'none' }}
      />
      <p style={{ margin: 0, fontSize: 12, color: C.soft, lineHeight: 1.6 }}>{invite.org_name} gives you this code directly, by message or in person. It isn’t shown here.</p>
      {error && <ErrorText>{error}</ErrorText>}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button label="Accept invite" onClick={() => void accept()} loading={busy === 'accept'} disabled={busy === 'decline'} />
        {confirmDecline ? (
          <>
            <Button variant="danger" label="Yes, decline" onClick={() => void decline()} loading={busy === 'decline'} disabled={busy === 'accept'} />
            <Button variant="ghost" label="Keep" onClick={() => setConfirmDecline(false)} />
          </>
        ) : (
          <Button variant="secondary" label="Decline" onClick={() => setConfirmDecline(true)} disabled={busy !== null} />
        )}
      </div>
    </Card>
  );
}

/** Invitations to private agents, addressed to this person's email. */
export function RequestsView() {
  const [invites, setInvites] = useState<MyInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('my_agent_invites').select('*').order('created_at', { ascending: false });
    if (err) { setError('Could not load invitations. Check your connection and try again.'); setInvites((i) => i ?? []); return; }
    setError(null);
    setInvites((data as MyInvite[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pending = (invites ?? []).filter((i) => i.status === 'pending');
  const past = (invites ?? []).filter((i) => i.status !== 'pending');

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
      <PageHeader title="Invitations" subtitle="Private agents you've been invited to use" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <ErrorText>{error}</ErrorText>}
        {invites === null ? (
          <Center><Spinner size={24} /></Center>
        ) : (
          <>
            {pending.length === 0 && <EmptyState title="No invitations waiting" body="When someone invites you to a private agent, it shows up here." icon="mail" />}
            {pending.map((i) => <InviteCard key={i.id} invite={i} onChanged={() => void load()} />)}
            {past.length > 0 && (
              <Card style={{ padding: 0, maxWidth: 560 }}>
                <div style={{ padding: '12px 16px', fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted }}>Earlier invitations</div>
                {past.map((i) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: `1px solid ${C.line}` }}>
                    <Avatar name={i.agent_name} size={30} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.agent_name}</span>
                    <Chip label={LABEL[i.status]} tone={TONE[i.status]} />
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
