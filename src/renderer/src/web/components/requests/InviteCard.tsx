// components/requests/InviteCard.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ConfirmModal from '@/components/ConfirmModal';
import { AgentAvatar } from '@/components/AgentAvatar';
import { Btn, Card, Chip, Spinner } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate } from '@/components/account/format';
import type { MyInvite } from './types';

// One invitation waiting for an answer. The code is not shown anywhere on the platform: the person who invited you gives
// it to you directly, and entering it is what proves the invite is yours. Accepting adds the agent to My Agents.

const CODE_LENGTH = 8;
/** Codes are typed or pasted from a message: drop spaces and dashes, upper-case, cap the length. */
function cleanCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase().slice(0, CODE_LENGTH);
}

export function InviteCard({ invite, onAccepted, onDeclined }: {
  invite: MyInvite;
  onAccepted: (agentId: string) => void;
  onDeclined: (id: string) => void;
}) {
  const [code, setCode] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    if (code.length < CODE_LENGTH) { setError(`The code has ${CODE_LENGTH} characters. Check it with the person who invited you.`); return; }
    setAccepting(true); setError('');
    const { data, error: rpcError } = await createClient().rpc('redeem_agent_invite', { p_code: code });
    setAccepting(false);
    if (rpcError) { setError('That code didn’t work. It may be mistyped, already used, or the invite was cancelled.'); return; }
    onAccepted(data as string);
  };

  const decline = async () => {
    setDeclining(true);
    const { error: rpcError } = await createClient().rpc('reject_agent_invite', { p_invite_id: invite.id });
    setDeclining(false);
    if (rpcError) { setError('Could not decline this invite. Please try again.'); setConfirmDecline(false); return; }
    setConfirmDecline(false);
    onDeclined(invite.id);
  };

  const busy = accepting || declining;

  return (
    <Card pad="0" hover style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.95rem', padding: '1.2rem 1.4rem', flexWrap: 'wrap' }}>
        <AgentAvatar name={invite.agent_name} size={46} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p style={{ fontSize: '1rem', fontWeight: 500, letterSpacing: '-0.015em', color: C.ink, margin: 0 }}>{invite.agent_name}</p>
          <p style={{ fontSize: '0.78rem', color: C.soft, margin: '0.2rem 0 0' }}>Invited by {invite.org_name} · {fmtDate(invite.created_at)}</p>
        </div>
        <Chip tone="brass" dot>Waiting for you</Chip>
      </div>

      <div style={{ padding: '1.1rem 1.4rem 1.25rem', background: C.paper, borderTop: `1px solid ${C.lineSoft}` }}>
        <label htmlFor={`code-${invite.id}`} style={{ display: 'block', fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: C.muted, marginBottom: '0.45rem' }}>Invite code</label>
        <form onSubmit={e => { e.preventDefault(); if (!busy) void accept(); }} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            id={`code-${invite.id}`} type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            value={code} onChange={e => { setCode(cleanCode(e.target.value)); setError(''); }}
            placeholder="XXXXXXXX" aria-describedby={`code-help-${invite.id}`}
            style={{ flex: '1 1 200px', minWidth: 0, padding: '0.6rem 0.85rem', fontSize: '1.05rem', fontFamily: MONO, letterSpacing: '0.2em', color: C.ink, background: '#fff', border: '1px solid #DAD5C5', borderRadius: 6, outline: 'none', textTransform: 'uppercase' }}
          />
          <Btn type="submit" variant="primary" disabled={busy || code.length === 0} style={{ padding: '0.6rem 1.4rem' }}>
            {accepting && <Spinner size={14} color="#fff" />}
            {accepting ? 'Checking…' : 'Accept invite'}
          </Btn>
          <Btn type="button" variant="ghost" disabled={busy} onClick={() => setConfirmDecline(true)} style={{ color: C.red }}>Decline</Btn>
        </form>
        <p id={`code-help-${invite.id}`} style={{ fontSize: '0.74rem', color: C.soft, margin: '0.65rem 0 0', lineHeight: 1.55 }}>
          {invite.org_name} gives you this code directly, by message or in person. It isn’t shown here.
        </p>
        {error && <p role="alert" style={{ fontSize: '0.78rem', color: C.red, margin: '0.6rem 0 0', lineHeight: 1.5 }}>{error}</p>}
      </div>

      {confirmDecline && (
        <ConfirmModal
          eyebrow="Decline this invite"
          title={`Decline the invite to ${invite.agent_name}?`}
          message="The person who sent it will see that you declined. You would need a new invite from them to reconsider later."
          confirmLabel="Decline"
          pendingLabel="Declining…"
          loading={declining}
          onClose={() => setConfirmDecline(false)}
          onConfirm={decline}
        />
      )}
    </Card>
  );
}

/** Shown in place of the code form straight after accepting, so the next step is one click away. */
export function AcceptedCard({ invite }: { invite: MyInvite }) {
  return (
    <Card pad="1.2rem 1.4rem" style={{ background: C.greenWash, borderColor: C.greenLine }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.95rem', flexWrap: 'wrap' }}>
        <AgentAvatar name={invite.agent_name} size={46} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 500, color: C.ink, margin: 0 }}>You’re connected to {invite.agent_name}</p>
          <p style={{ fontSize: '0.78rem', color: C.green, margin: '0.2rem 0 0' }}>It’s now in your My Agents list.</p>
        </div>
        <Link href={`/agents/${invite.agent_id}`} style={{ background: C.ink, color: '#F7F6F2', textDecoration: 'none', fontSize: '0.82rem', padding: '0.55rem 1.1rem', borderRadius: 6 }}>Open agent</Link>
      </div>
    </Card>
  );
}
