// app/(shell)/account/organizations/OrgCard.tsx
'use client';

import type { ReactNode } from 'react';
import { Btn, Chip, Meter, toneColors } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate, fmtDateShort, initials } from '@/components/account/format';
import { subInfo, summarize, type SubInfo } from './subscription';
import type { Organization, OrgAgent } from './types';

// One workspace: who it is, how its subscriptions stand at a glance, and each agent's plan
// with the action that makes sense for its state (Renew when it is healthy or running out,
// Subscribe when there is no live plan).

const VISIBILITY_TONE = { personal: 'slate', private: 'brass', public: 'neutral' } as const;

function visibilityTone(visibility: string) {
  return VISIBILITY_TONE[visibility as keyof typeof VISIBILITY_TONE] ?? 'neutral';
}

function StatCell({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ padding: '0.85rem 1rem', minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>{label}</p>
      <p style={{ fontSize: '1.2rem', fontWeight: 500, letterSpacing: '-0.02em', color: C.ink, margin: 0, lineHeight: 1.15 }}>{children}</p>
      {sub && <p style={{ fontSize: '0.7rem', color: C.soft, margin: '0.3rem 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</p>}
    </div>
  );
}

function statusChip(info: SubInfo) {
  switch (info.state) {
    case 'active': return <Chip tone="green" dot>Active</Chip>;
    case 'expiring': return <Chip tone="amber" dot>Expiring soon</Chip>;
    case 'expired': return <Chip tone="red" dot>Expired</Chip>;
    case 'none': return <Chip tone="red" dot>Not subscribed</Chip>;
    default: return <Chip tone="neutral">No plan needed</Chip>;
  }
}

function AgentRow({ agent, now, onSubscribe }: { agent: OrgAgent; now: number; onSubscribe: () => void }) {
  const info = subInfo(agent, now);
  const live = info.state === 'active' || info.state === 'expiring';
  const meterTone = info.state === 'expiring' ? 'amber' : 'green';
  const needsPlan = info.state === 'expired' || info.state === 'none';
  const t = toneColors(visibilityTone(agent.visibility));

  return (
    <div className="ac-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.3fr) minmax(170px, 1.2fr) 92px', gap: '0.75rem 1.1rem', alignItems: 'center', padding: '0.8rem 1.25rem', borderTop: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 7, background: t.bg, border: `1px solid ${t.line}`, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '0.62rem', flexShrink: 0 }}>
          {initials(agent.name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</p>
          <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: t.fg, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '2px 0 0' }}>
            {agent.visibility}{info.rate > 0 ? ` · $${info.rate}/mo` : ''}
          </p>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
          {statusChip(info)}
          {live && agent.current_period_end && (
            <span style={{ fontSize: '0.72rem', color: info.state === 'expiring' ? C.amber : C.soft, fontWeight: info.state === 'expiring' ? 500 : 400 }}>
              {info.daysLeft === 0 ? 'ends today' : info.daysLeft === 1 ? '1 day left' : `${info.daysLeft} days left`}
            </span>
          )}
        </div>
        {live && agent.current_period_end ? (
          <div style={{ marginTop: '0.5rem' }}>
            <Meter value={(info.daysLeft ?? 0) / 31} tone={meterTone} height={4} />
            <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, margin: '0.35rem 0 0' }}>Valid till {fmtDate(agent.current_period_end)}</p>
          </div>
        ) : info.state === 'expired' && agent.current_period_end ? (
          <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.red, margin: '0.45rem 0 0' }}>Ended {fmtDate(agent.current_period_end)} · agent is paused</p>
        ) : info.state === 'none' ? (
          <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.red, margin: '0.45rem 0 0' }}>Agent is paused until subscribed</p>
        ) : null}
      </div>

      <div style={{ justifySelf: 'end' }}>
        {info.state === 'free' ? (
          <span style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted }}>—</span>
        ) : (
          <Btn
            size="sm"
            variant={needsPlan || info.state === 'expiring' ? 'brass' : 'outline'}
            onClick={onSubscribe}
          >
            {needsPlan ? 'Subscribe' : 'Renew'}
          </Btn>
        )}
      </div>
    </div>
  );
}

export function OrgCard({ org, agents, now, onEdit, onSubscribe }: {
  org: Organization;
  agents: OrgAgent[];
  now: number;
  onEdit: () => void;
  onSubscribe: (agent: OrgAgent) => void;
}) {
  const summary = summarize(agents, now);
  const attention = summary.needsAttention;

  return (
    <section className="ac-card-hover" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Identity */}
      <div style={{ padding: '1.25rem 1.25rem 1.1rem', background: `linear-gradient(180deg, ${C.brassTint} 0%, #FFFFFF 100%)`, borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <span style={{ width: 46, height: 46, borderRadius: 10, background: C.ink, color: '#F7F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '0.82rem', flexShrink: 0, boxShadow: `0 0 0 3px ${C.brassWash}` }}>
            {initials(org.name)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: '1.08rem', fontWeight: 500, letterSpacing: '-0.02em', color: C.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name}</h2>
            <p style={{ fontFamily: MONO, fontSize: '0.66rem', color: C.soft, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              /{org.slug} · created {fmtDate(org.created_at)}
            </p>
          </div>
          <Chip tone="brass">Owner</Chip>
          <Btn size="sm" variant="outline" onClick={onEdit}>Edit</Btn>
        </div>
        {org.description
          ? <p style={{ fontSize: '0.84rem', color: C.body, fontWeight: 300, margin: '0.9rem 0 0', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{org.description}</p>
          : <p style={{ fontSize: '0.82rem', color: C.muted, margin: '0.9rem 0 0', fontStyle: 'italic' }}>No description yet.</p>}
      </div>

      {/* At a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', borderBottom: `1px solid ${C.line}` }}>
        <StatCell label="Agents" sub={summary.agents === 0 ? 'none yet' : `${summary.gated} on a plan`}>{summary.agents}</StatCell>
        <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
          <StatCell label="Active plans" sub={summary.gated === 0 ? 'nothing to subscribe' : attention > 0 ? `${attention} need attention` : 'all healthy'}>
            <span style={{ color: summary.gated > 0 && attention === 0 ? C.green : attention > 0 ? C.amber : C.ink }}>{summary.active}</span>
            <span style={{ color: C.faint, fontSize: '0.9rem' }}> / {summary.gated}</span>
          </StatCell>
        </div>
        <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
          <StatCell label="Plans cost" sub="per month, live plans">{summary.monthlyUsd > 0 ? `$${summary.monthlyUsd}` : '—'}</StatCell>
        </div>
        <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
          <StatCell label="Next renewal" sub={summary.nextRenewal ? 'soonest plan to end' : 'no live plans'}>{summary.nextRenewal ? fmtDateShort(summary.nextRenewal) : '—'}</StatCell>
        </div>
      </div>

      {/* Agents + subscriptions */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem 0.55rem' }}>
          <h3 style={{ fontFamily: MONO, fontSize: '0.64rem', fontWeight: 500, color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>Agents &amp; subscriptions</h3>
          {attention > 0 && <Chip tone="amber" dot>{attention} need{attention === 1 ? 's' : ''} attention</Chip>}
        </div>
        {agents.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: C.muted, margin: 0, padding: '0.4rem 1.25rem 1.4rem', fontStyle: 'italic', borderTop: `1px solid ${C.lineSoft}` }}>
            No agents in this workspace yet. Create one from My Agents.
          </p>
        ) : (
          agents.map(agent => <AgentRow key={agent.id} agent={agent} now={now} onSubscribe={() => onSubscribe(agent)} />)
        )}
      </div>
    </section>
  );
}
