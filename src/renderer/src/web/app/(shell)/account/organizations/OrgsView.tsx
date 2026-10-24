// app/(shell)/account/organizations/OrgsView.tsx
'use client';

import { AccountPage, Btn, Card, Chip, EmptyState } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDateShort } from '@/components/account/format';
import { OrgCard } from './OrgCard';
import { summarize } from './subscription';
import type { Organization, OrgAgent } from './types';

export const MAX_ORGS = 2;

function Overview({ label, value, sub, valueColor }: { label: string; value: React.ReactNode; sub?: string; valueColor?: string }) {
  return (
    <div style={{ padding: '1rem 1.25rem', minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.4rem' }}>{label}</p>
      <p style={{ fontSize: '1.55rem', fontWeight: 500, letterSpacing: '-0.025em', color: valueColor ?? C.ink, margin: 0, lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.72rem', color: C.soft, margin: '0.4rem 0 0' }}>{sub}</p>}
    </div>
  );
}

/** The Organizations tab's body. Pure display: the page loads the data and owns the modals. */
export function OrgsView({ orgs, agentsByOrg, now, onCreate, onEdit, onSubscribe }: {
  orgs: Organization[];
  agentsByOrg: Record<string, OrgAgent[]>;
  now: number;
  onCreate: () => void;
  onEdit: (org: Organization) => void;
  onSubscribe: (agent: OrgAgent) => void;
}) {
  const canCreate = orgs.length < MAX_ORGS;
  const allAgents = Object.values(agentsByOrg).flat();
  const total = summarize(allAgents, now);

  return (
    <AccountPage
      eyebrow="Organizations"
      title="Your workspaces"
      subtitle="Each workspace holds its own agents. Personal and private agents need an active plan to run; keep them topped up here."
      maxWidth="100%"
      actions={canCreate && (
        <Btn variant="primary" onClick={onCreate}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          New organization
        </Btn>
      )}
    >
      {orgs.length === 0 ? (
        <Card pad="0">
          <EmptyState
            icon={<svg width="20" height="20" viewBox="0 0 18 18" fill="none"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
            title="No organizations yet"
            action={<Btn variant="primary" onClick={onCreate}>Create organization</Btn>}
          >
            Create your first workspace to start building agents.
          </EmptyState>
        </Card>
      ) : (
        <>
          {total.needsAttention > 0 && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: C.amberWash, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: '0.8rem 1.1rem', marginBottom: '1rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.amber, flexShrink: 0 }} />
              <p style={{ fontSize: '0.83rem', color: '#6E3F10', margin: 0, lineHeight: 1.5 }}>
                <strong style={{ fontWeight: 600 }}>{total.needsAttention} agent{total.needsAttention === 1 ? ' needs' : 's need'} a plan.</strong>{' '}
                Agents whose plan has ended stop answering until they are renewed; ones marked <em>expiring soon</em> are about to.
              </p>
            </div>
          )}

          {/* Overview across every workspace */}
          <Card pad="0" style={{ marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              <Overview label="Workspaces" value={<>{orgs.length}<span style={{ color: C.faint, fontSize: '1rem' }}> / {MAX_ORGS}</span></>} sub={canCreate ? 'room for one more' : 'free plan limit reached'} />
              <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}><Overview label="Agents" value={total.agents} sub={`${total.gated} on a plan`} /></div>
              <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
                <Overview
                  label="Active plans" valueColor={total.gated > 0 ? (total.needsAttention === 0 ? C.green : C.amber) : undefined}
                  value={<>{total.active}<span style={{ color: C.faint, fontSize: '1rem' }}> / {total.gated}</span></>}
                  sub={total.gated === 0 ? 'none required yet' : total.needsAttention === 0 ? 'all running' : `${total.needsAttention} need attention`}
                />
              </div>
              <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}><Overview label="Plans cost" value={total.monthlyUsd > 0 ? `$${total.monthlyUsd}` : '—'} sub="per month, live plans" /></div>
              <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
                <Overview label="Next renewal" value={total.nextRenewal ? fmtDateShort(total.nextRenewal) : '—'} sub={total.nextRenewal ? 'soonest plan to end' : 'no live plans'} />
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 540px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
            {orgs.map(org => (
              <OrgCard
                key={org.id}
                org={org}
                agents={agentsByOrg[org.id] ?? []}
                now={now}
                onEdit={() => onEdit(org)}
                onSubscribe={onSubscribe}
              />
            ))}
          </div>
          <p style={{ display: 'flex', justifyContent: 'center', margin: '1.75rem 0 0' }}>
            <Chip tone="neutral">{orgs.length} / {MAX_ORGS} organizations · free plan</Chip>
          </p>
        </>
      )}
    </AccountPage>
  );
}
