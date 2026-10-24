// components/agent-profile/UsageCard.tsx
'use client';

import Link from 'next/link';
import { Chip } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate } from '@/components/account/format';
import { formatPhone, RETENTION_DAYS, WA_LIMITS } from '@/lib/whatsapp';
import { Disclosure, IconTile, SectionCard, UI_CSS, UsageBar } from './ui';
import { useChannelUsage } from './useChannelUsage';
import { useComputeQuota } from './useComputeQuota';

// "Usage" on the Agent Profile: one bar per allowance, each a percentage of what is used (never the allowance itself).
//   Compute   -- the code-execution runs included in the plan month (everyone who can see the profile)
//   Email     -- recipients emailed over the last 24 hours against the sending limit (owner, while email is on)
//   WhatsApp  -- messages sent over the last 24 hours against the sending limit, and what reading has to work with (owner, while WhatsApp is on)
// A channel that is switched off is not shown at all.

const pct = (used: number, of: number) => (of > 0 ? Math.round((used / of) * 100) : 0);
// Shows the stored price exactly (a sub-cent price like 0.0015 must not round to 0.002), trimming trailing zeros.
const price = (n: number) => `$${n < 0.1 ? n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0') : n.toFixed(2)}`;
const WA = '#1FA855';

const small: React.CSSProperties = { fontSize: '0.72rem', color: C.soft, margin: '0.3rem 0 0', lineHeight: 1.6 };

function Divider() { return <div style={{ borderTop: `1px solid ${C.lineSoft}`, margin: '1rem 0' }} />; }

function ComputeRow({ agentId }: { agentId: string }) {
  const { quota, loading } = useComputeQuota(agentId);
  if (loading || !quota) {
    return <UsageBar icon="gauge" color={C.slate} label="Compute" percent={null} caption={loading ? undefined : 'Not available right now.'} />;
  }
  if (!quota.has_plan) {
    return <UsageBar icon="gauge" color={C.slate} label="Compute" percent={null} caption="This agent has no active plan, so it can’t run code until the plan is renewed." />;
  }
  const charging = quota.mode === 'enforce';
  const used = pct(quota.used, quota.included);
  const over = quota.overflow > 0;
  return (
    <div>
      <UsageBar
        icon="gauge" color={C.slate} label="Compute" percent={used}
        aside={quota.cycle_end ? <Chip>Refills {fmtDate(quota.cycle_end)}</Chip> : undefined}
        caption={over ? (charging ? 'Past the allowance: extra use is paid from the balance.' : 'Past the allowance. Extra use isn’t charged yet.') : 'Of this plan month’s included compute.'}
      />
      <Disclosure label="Details and limits">
        <p style={small}>
          {charging ? 'After the allowance, runs are paid from the balance' : 'After the allowance, runs will be paid from the balance'} at {price(quota.price_per_run)} each{charging ? '' : '. Nothing is charged for them yet'}.
        </p>
        {quota.shared_pool && quota.your_cap !== null && <p style={small}>Your share of the shared pool: <strong style={{ fontWeight: 500, color: C.ink }}>{pct(quota.your_used, quota.your_cap)}% used</strong>. The rest is kept for the other people connected.</p>}
        {quota.shared_pool && quota.is_owner && <p style={small}>Shared by everyone connected; each person can use up to {Math.round(quota.user_cap_fraction * 100)}% of it.</p>}
        <p style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.04em', color: C.muted, margin: '0.6rem 0 0', lineHeight: 1.7 }}>
          Recurring tasks: up to {quota.limits.max_live_recurring_tasks} live, at most every {quota.limits.min_recurring_interval_minutes} min · Projects: {quota.limits.max_projects_per_cycle} a plan month · Shifts: {quota.limits.max_active_shifts}
        </p>
        <p style={{ fontSize: '0.7rem', color: C.muted, margin: '0.35rem 0 0' }}>We’re working to increase these limits.</p>
      </Disclosure>
    </div>
  );
}

export function UsageCard({ agentId, visibility, owner }: { agentId: string; visibility: 'personal' | 'private' | 'public'; owner: boolean }) {
  const { email, whatsapp, loading } = useChannelUsage(agentId, owner);
  const showCompute = visibility !== 'public';
  const rows: React.ReactNode[] = [];

  if (showCompute) rows.push(<ComputeRow key="compute" agentId={agentId} />);

  if (email) {
    rows.push(
      <UsageBar
        key="email" icon="mail" color={C.brass} label="Email" percent={pct(email.used, email.cap)} title={`${email.used} of ${email.cap} recipients in the last 24 hours`}
        aside={email.suspended ? <Chip tone="red">Sending off</Chip> : <Link href={`/agents/${agentId}/email`} style={{ fontSize: '0.7rem', color: C.soft, textDecoration: 'underline' }}>Manage</Link>}
        caption="Of today’s sending limit, over the last 24 hours."
      />,
    );
  }

  if (whatsapp) {
    const connected = whatsapp.status === 'connected';
    rows.push(
      <div key="whatsapp">
        <UsageBar
          icon="whatsapp" color={WA} label="WhatsApp sending" percent={whatsapp.linked ? pct(whatsapp.used, whatsapp.cap) : null}
          title={whatsapp.linked ? `${whatsapp.used} of ${whatsapp.cap} messages in the last 24 hours` : undefined}
          aside={<Link href={`/agents/${agentId}/whatsapp`} style={{ fontSize: '0.7rem', color: C.soft, textDecoration: 'underline' }}>{whatsapp.linked ? 'Manage' : 'Link a number'}</Link>}
          caption={whatsapp.linked
            ? <>Of today’s sending limit, over the last 24 hours. {formatPhone(whatsapp.phone)}{connected ? '' : ' is not connected right now.'}</>
            : 'No number is linked yet.'}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.9rem' }}>
          <IconTile icon="eye" color={WA} size={28} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: 0 }}>WhatsApp reading</p>
            <p style={{ fontSize: '0.72rem', color: C.soft, margin: '0.15rem 0 0', lineHeight: 1.55 }}>
              {whatsapp.linked
                ? <>{whatsapp.chatsRead} chat{whatsapp.chatsRead === 1 ? '' : 's'} open for reading, {whatsapp.chatsSend} for sending. {whatsapp.messagesStored.toLocaleString()} message{whatsapp.messagesStored === 1 ? '' : 's'} kept.</>
                : 'Reading starts once a number is linked and chats are opened.'}
            </p>
          </div>
        </div>
        <Disclosure label="WhatsApp limits">
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.72rem', color: C.soft, lineHeight: 1.75 }}>
            <li><strong style={{ fontWeight: 500, color: C.ink }}>Sending:</strong> a daily limit you set on the WhatsApp tab ({whatsapp.cap} now, up to 500), counted over a rolling 24 hours.</li>
            <li>Messages up to {WA_LIMITS.sendTextMaxChars.toLocaleString()} characters; files up to {WA_LIMITS.sendFileMaxMb} MB.</li>
            <li>The same message isn’t sent to a chat twice within {WA_LIMITS.duplicateWindowMinutes} minutes, and messages go out one at a time with a pause.</li>
            <li><strong style={{ fontWeight: 500, color: C.ink }}>Reading:</strong> only chats you open, up to {WA_LIMITS.readMaxMessages} messages per read ({WA_LIMITS.readDefaultMessages} by default).</li>
            <li>History is kept {RETENTION_DAYS} days. Each message is cut to {WA_LIMITS.readTextCharsPerMessage.toLocaleString()} characters for the agent, and up to {WA_LIMITS.readAttachmentsPerRead} attachments are copied to the workspace per read.</li>
            <li>There is no daily limit on reading itself.</li>
          </ul>
        </Disclosure>
      </div>,
    );
  }

  if (rows.length === 0 && !loading) return null;

  return (
    <SectionCard icon="gauge" color={C.slate} title="Usage" description="How much of each allowance is used.">
      <style>{UI_CSS}</style>
      <div style={{ paddingBottom: '1.1rem' }}>
        {rows.length === 0 ? <p style={{ fontSize: '0.78rem', color: C.muted, margin: 0 }}>–</p> : rows.map((r, i) => <div key={i}>{i > 0 && <Divider />}{r}</div>)}
      </div>
    </SectionCard>
  );
}
