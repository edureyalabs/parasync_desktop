// app/(shell)/account/usage/ComputeUsage.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardTitle } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtUsd } from '@/components/account/format';
import { sourceLabel } from './model';
import type { Scope } from './UsageView';

// Code-execution runs over the last 30 days, beside the token spend above: how many runs, how many the plans'
// allowances covered, how many went past them and what that is (or, while runs are not charged yet, would be) worth.
// Same two scopes as the rest of the page: runs charged to my wallet, or runs I made myself.

const DAYS = 30;

interface Row { agent_id: string; agent_name: string; source: string; runs: number; from_quota: number; from_wallet: number; cost: number; would_cost: number }

const runsFmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US');

function tz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: '1rem 1.3rem', minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.45rem' }}>{label}</p>
      <p style={{ fontSize: '1.3rem', fontWeight: 500, letterSpacing: '-0.02em', color: C.ink, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.72rem', color: C.soft, margin: '0.4rem 0 0', lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; runs: number; billed: number }[] }) {
  const max = Math.max(...rows.map(r => r.runs), 1);
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.7rem' }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {rows.map(r => (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.8rem', color: C.body }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.76rem', color: C.ink, flexShrink: 0 }}>
                {runsFmt(r.runs)}{r.billed > 0 ? ` · ${fmtUsd(r.billed)}` : ''}
              </span>
            </div>
            <div role="presentation" style={{ height: 4, borderRadius: 4, background: C.lineSoft, marginTop: 5 }}>
              <div style={{ width: `${(r.runs / max) * 100}%`, height: '100%', borderRadius: 4, background: C.brass }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComputeUsage({ scope }: { scope: Scope }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (DAYS - 1));
      const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
      const { data, error } = await createClient()
        .rpc('account_compute_series', { p_scope: scope, p_from: from.toISOString(), p_to: to.toISOString(), p_tz: tz() })
        .range(0, 999);
      if (cancelled) return;
      if (error) { setFailed(true); setRows([]); return; }
      setFailed(false);
      setRows(((data as Record<string, unknown>[] | null) ?? []).map(r => ({
        agent_id: String(r.agent_id ?? ''), agent_name: String(r.agent_name ?? 'Deleted agent'), source: String(r.source ?? 'unknown'),
        runs: Number(r.runs) || 0, from_quota: Number(r.from_quota) || 0, from_wallet: Number(r.from_wallet) || 0,
        cost: Number(r.cost) || 0, would_cost: Number(r.would_cost) || 0,
      })));
    })();
    return () => { cancelled = true; };
  }, [scope]);

  const m = useMemo(() => {
    const all = rows ?? [];
    const sum = (f: (r: Row) => number) => all.reduce((t, r) => t + f(r), 0);
    const group = (key: (r: Row) => string, label: (r: Row) => string) => {
      const map = new Map<string, { label: string; runs: number; billed: number }>();
      for (const r of all) {
        const k = key(r);
        const cur = map.get(k) ?? { label: label(r), runs: 0, billed: 0 };
        cur.runs += r.runs; cur.billed += r.cost;
        map.set(k, cur);
      }
      return [...map.values()].sort((a, b) => b.runs - a.runs);
    };
    return {
      runs: sum(r => r.runs), covered: sum(r => r.from_quota), past: sum(r => r.from_wallet),
      billed: sum(r => r.cost), wouldBe: sum(r => r.would_cost),
      byAgent: group(r => r.agent_id, r => r.agent_name), bySource: group(r => r.source, r => sourceLabel(r.source)),
    };
  }, [rows]);

  if (rows === null) return null;

  return (
    <Card pad="0" style={{ overflow: 'hidden', marginTop: '1.25rem' }}>
      <div style={{ padding: '1.15rem 1.4rem 0.9rem' }}>
        <CardTitle>Code runs · last {DAYS} days</CardTitle>
        <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0, lineHeight: 1.6 }}>
          Every time an agent runs code is one run. Each plan includes a monthly allowance; past it, runs are paid from the balance.
        </p>
      </div>
      {failed ? (
        <p style={{ fontSize: '0.8rem', color: C.muted, margin: 0, padding: '0 1.4rem 1.2rem' }}>Code-run usage isn’t available right now.</p>
      ) : m.runs === 0 ? (
        <p style={{ fontSize: '0.8rem', color: C.muted, margin: 0, padding: '0 1.4rem 1.2rem' }}>No code runs in this period.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', borderTop: `1px solid ${C.lineSoft}` }}>
            <Kpi label="Runs" value={runsFmt(m.runs)} />
            <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}><Kpi label="Covered by plans" value={runsFmt(m.covered)} sub="Included in the monthly allowance" /></div>
            <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}><Kpi label="Past the allowance" value={runsFmt(m.past)} /></div>
            <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
              <Kpi
                label={m.billed > 0 || m.wouldBe === 0 ? 'Charged' : 'Will be charged'}
                value={fmtUsd(m.billed > 0 ? m.billed : m.wouldBe)}
                sub={m.billed === 0 && m.wouldBe > 0 ? 'Extra runs aren’t charged yet' : undefined}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem 2.5rem', padding: '1.2rem 1.4rem 1.3rem', borderTop: `1px solid ${C.lineSoft}` }}>
            <Breakdown title="By agent" rows={m.byAgent.slice(0, 6)} />
            <Breakdown title="By what started it" rows={m.bySource.slice(0, 6)} />
          </div>
        </>
      )}
    </Card>
  );
}
