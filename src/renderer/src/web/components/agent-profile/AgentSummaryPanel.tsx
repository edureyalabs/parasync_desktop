// components/agent-profile/AgentSummaryPanel.tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { fmtCompact, fmtUsd } from '@/components/account/format';
import type { AgentSummary } from './useAgentSummary';

// "Overview" beside the owner's form: what the agent is equipped with, the work it has, who can reach it and what it cost recently. Every line is a link to the
// tab where that thing is managed.

function Row({ href, icon, label, value, muted }: { href: string; icon: IconName; label: string; value: ReactNode; muted?: boolean }) {
  return (
    <Link href={href} className="ac-row" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.42rem 1.4rem', textDecoration: 'none', color: C.body, fontSize: '0.8rem' }}>
      <span style={{ color: C.muted, display: 'inline-flex' }}><Icon name={icon} size={14} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem', color: muted ? C.faint : C.ink }}>{value}</span>
      <span aria-hidden="true" style={{ color: C.faint }}>›</span>
    </Link>
  );
}

function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${C.lineSoft}`, padding: '0.8rem 0 0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.4rem 0.3rem' }}>
        <p style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>{title}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function AgentSummaryPanel({ agentId, visibility, summary, loading }: {
  agentId: string; visibility: 'personal' | 'private' | 'public'; summary: AgentSummary; loading: boolean;
}) {
  const base = `/agents/${agentId}`;
  const c = summary.counts;
  const shared = visibility !== 'personal';
  const dash = loading ? '–' : null;
  const val = (n: number) => dash ?? n.toLocaleString();
  const total = summary.network.active + summary.network.paused;
  const none = (n: number) => !loading && n === 0;

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', paddingTop: '1.1rem' }}>
      <div style={{ padding: '0 1.4rem 0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 500, color: C.ink, margin: 0 }}>Overview</h2>
        {!loading && summary.subscription && summary.subscription.state !== 'free' && (
          <Link href="/account/organizations" style={{ fontSize: '0.72rem', color: C.soft, textDecoration: 'underline' }}>Manage plan</Link>
        )}
      </div>

      <Group title="Equipped with">
        <Row href={`${base}/instructions`} icon="notebook-pen" label="Instructions" value={val(c.instructions)} muted={none(c.instructions)} />
        <Row href={`${base}/platform-tools`} icon="sliders-horizontal" label="Platform tools" value={val(c.platformTools)} muted={none(c.platformTools)} />
        <Row href={`${base}/tools`} icon="wrench" label="Custom tools" value={val(c.tools)} muted={none(c.tools)} />
        <Row href={`${base}/mcp`} icon="plug" label="MCP servers" value={val(c.mcp)} muted={none(c.mcp)} />
        <Row href={`${base}/signed-apis`} icon="database" label="Database integrations" value={val(c.signedApis)} muted={none(c.signedApis)} />
        <Row href={`${base}/secrets`} icon="key-round" label="Secrets" value={val(c.secrets)} muted={none(c.secrets)} />
      </Group>

      <Group title="Your work">
        <Row href={`${base}/crons`} icon="list-checks" label="Open tasks" value={val(c.openTasks)} muted={none(c.openTasks)} />
        <Row href={`${base}/crons`} icon="sun" label="Shifts" value={val(c.shifts)} muted={none(c.shifts)} />
      </Group>

      {shared && (
        <Group title="Reach">
          <Row href={`${base}/network`} icon="users" label="Connected users" value={dash ?? (summary.network.paused > 0 ? `${summary.network.active} + ${summary.network.paused} paused` : total.toLocaleString())} muted={none(total)} />
          {visibility === 'private' && <Row href={`${base}/network`} icon="mail" label="Invites waiting" value={val(summary.network.pending)} muted={none(summary.network.pending)} />}
        </Group>
      )}

      <Group title={`Last ${summary.usageDays} days`} aside={<Link href="/account/usage" style={{ fontSize: '0.7rem', color: C.soft, textDecoration: 'underline' }}>Usage</Link>}>
        {summary.usage === null && !loading ? (
          <p style={{ fontSize: '0.76rem', color: C.muted, margin: 0, padding: '0.2rem 1.4rem 0.5rem' }}>Spend isn’t available right now.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', padding: '0.2rem 1.4rem 0.6rem' }}>
            {[
              ['Billed to you', loading || !summary.usage ? '–' : fmtUsd(summary.usage.cost)],
              ['Model calls', loading || !summary.usage ? '–' : summary.usage.calls.toLocaleString()],
              ['Tokens', loading || !summary.usage ? '–' : fmtCompact(summary.usage.tokens)],
            ].map(([label, v]) => (
              <div key={label} style={{ minWidth: 0 }}>
                <p style={{ fontFamily: MONO, fontSize: '0.56rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, margin: '0 0 0.25rem' }}>{label}</p>
                <p style={{ fontSize: '0.98rem', fontWeight: 500, letterSpacing: '-0.02em', color: C.ink, margin: 0 }}>{v}</p>
              </div>
            ))}
          </div>
        )}
      </Group>
    </div>
  );
}

