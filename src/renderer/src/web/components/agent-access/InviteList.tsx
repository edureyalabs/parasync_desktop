// components/agent-access/InviteList.tsx
'use client';

import { useState } from 'react';
import { Btn, Chip, EmptyState } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate } from '@/components/account/format';
import { copyText } from '@/components/agent-ui/clipboard';
import type { Invite } from './types';

// Invites sent: the ones still waiting come first with what the owner can do about them (copy the code again, cancel);
// the settled ones sit below as a quiet history.

const TONE: Record<Invite['status'], 'brass' | 'green' | 'neutral' | 'red'> = { pending: 'brass', redeemed: 'green', revoked: 'neutral', rejected: 'red' };
const LABEL: Record<Invite['status'], string> = { pending: 'Waiting', redeemed: 'Accepted', revoked: 'Cancelled', rejected: 'Declined' };
const HISTORY_SHOWN = 5;

function Row({ invite, first, onCancel }: { invite: Invite; first: boolean; onCancel: (i: Invite) => void }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    setCopied((await copyText(invite.code)) ? 'yes' : 'no');
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="ac-row" style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', padding: '0.65rem 1.4rem', borderTop: first ? 'none' : `1px solid ${C.lineSoft}` }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <p style={{ fontSize: '0.84rem', color: C.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.invited_email}</p>
        <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, margin: '2px 0 0' }}>Sent {fmtDate(invite.created_at)}</p>
      </div>
      <Chip tone={TONE[invite.status]}>{LABEL[invite.status]}</Chip>
      {invite.status === 'pending' && (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <Btn size="sm" onClick={() => void copy()} title="Copy this invite's code again">{copied === 'yes' ? 'Copied ✓' : copied === 'no' ? 'Copy failed' : 'Copy code'}</Btn>
          <Btn size="sm" variant="ghost" onClick={() => onCancel(invite)} style={{ color: C.red }}>Cancel</Btn>
        </div>
      )}
    </div>
  );
}

export function InviteList({ invites, loading, onCancel }: { invites: Invite[]; loading: boolean; onCancel: (i: Invite) => void }) {
  const [showAll, setShowAll] = useState(false);
  if (loading) return <p style={{ fontSize: '0.78rem', color: C.muted, margin: 0, padding: '1rem 1.4rem', borderTop: `1px solid ${C.line}` }}>Loading invites…</p>;
  if (invites.length === 0) {
    return (
      <div style={{ borderTop: `1px solid ${C.line}` }}>
        <EmptyState
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="16" height="12" rx="2" /><path d="m4 7 7 5 7-5" /></svg>}
          title="No invites yet"
        >
          Create one above. Pending and past invites are listed here.
        </EmptyState>
      </div>
    );
  }
  const pending = invites.filter(i => i.status === 'pending');
  const settled = invites.filter(i => i.status !== 'pending');
  const history = showAll ? settled : settled.slice(0, HISTORY_SHOWN);

  return (
    <div style={{ maxHeight: 460, overflowY: 'auto', borderTop: `1px solid ${C.line}` }}>
      {pending.map((i, idx) => <Row key={i.id} invite={i} first={idx === 0} onCancel={onCancel} />)}
      {settled.length > 0 && pending.length > 0 && (
        <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0, padding: '0.5rem 1.4rem', background: C.paper, borderTop: `1px solid ${C.lineSoft}` }}>History</p>
      )}
      {history.map((i, idx) => <Row key={i.id} invite={i} first={idx === 0 && pending.length === 0} onCancel={onCancel} />)}
      {settled.length > HISTORY_SHOWN && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.6rem', borderTop: `1px solid ${C.lineSoft}` }}>
          <Btn size="sm" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show fewer' : `Show ${settled.length - HISTORY_SHOWN} more`}</Btn>
        </div>
      )}
    </div>
  );
}
