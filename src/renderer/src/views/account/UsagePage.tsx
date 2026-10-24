// src/renderer/src/views/account/UsagePage.tsx
// What the agents cost: "what I pay" (everything charged to your wallet, including other people's use of agents you pay
// for) or "what I use" (your own use, whoever pays). The server totals each day per agent and source; everything else (the
// range, the totals, the breakdowns) is worked out here from that one list.
import { useMemo, useState } from 'react';

import { Chip } from '@/components/ui';
import { Empty, Loaded, Panel, Row, TabPage } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { fmtCompact, fmtUsd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';

type Scope = 'payer' | 'user';
const WINDOW_DAYS = 90;
const PAGE = 1000;
const MAX_PAGES = 20;
const RANGES = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }] as const;

interface UsageRow { day: string; agent_id: string; agent_name: string; source: string; cost: number; calls: number; tokens: number }

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const humanSource = (s: string) => ({ chat: 'Chat', scheduled_task: 'Scheduled tasks', task_run: 'Task runs', task_planning: 'Task planning', shift_run: 'Shifts', shift_planning: 'Shift planning', project_run: 'Projects', tool_test: 'Tool tests' } as Record<string, string>)[s] ?? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

async function loadUsage(scope: Scope): Promise<UsageRow[]> {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (WINDOW_DAYS - 1));
  const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
  const fetchAll = async (tz: string): Promise<UsageRow[]> => {
    const out: UsageRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase.rpc('account_usage_series', { p_scope: scope, p_from: from.toISOString(), p_to: to.toISOString(), p_tz: tz }).range(page * PAGE, (page + 1) * PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = (data as Record<string, unknown>[] | null) ?? [];
      for (const r of batch) {
        out.push({
          day: String(r.day).slice(0, 10), agent_id: r.agent_id ? String(r.agent_id) : 'unknown', agent_name: r.agent_name ? String(r.agent_name) : 'Deleted agent',
          source: r.source ? String(r.source) : 'chat', cost: Number(r.cost) || 0, calls: Number(r.calls) || 0, tokens: (Number(r.prompt_tokens) || 0) + (Number(r.completion_tokens) || 0),
        });
      }
      if (batch.length < PAGE) break;
    }
    return out;
  };
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
  try { return await fetchAll(tz); } catch (e) {
    if (e instanceof Error && /time zone/i.test(e.message)) return fetchAll('UTC');
    throw new Error('Your usage could not be loaded.');
  }
}

function Bars({ days, values }: { days: string[]; values: number[] }) {
  const max = Math.max(...values, 0);
  const W = 860, H = 170, left = 8, top = 12, bottom = 26;
  const plotH = H - top - bottom;
  const step = (W - left * 2) / Math.max(days.length, 1);
  const barW = Math.max(2, Math.min(24, step * 0.7));
  const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const marks = days.length <= 7 ? days.map((_, i) => i) : [0, Math.floor(days.length / 2), days.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Spend per day" style={{ display: 'block' }}>
      <line x1={left} x2={W - left} y1={top + plotH} y2={top + plotH} stroke={C.line} />
      {values.map((v, i) => {
        const h = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * plotH) : 0;
        const x = left + i * step + (step - barW) / 2;
        return <rect key={days[i]} x={x} y={top + plotH - h} width={barW} height={h} rx={2} fill={C.brass}><title>{`${label(days[i]!)}: ${fmtUsd(v)}`}</title></rect>;
      })}
      {marks.map((i) => <text key={i} x={left + i * step + step / 2} y={H - 8} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'} fontSize="11" fill={C.soft} fontFamily={MONO}>{label(days[i]!)}</text>)}
      <text x={W - left} y={top - 1} textAnchor="end" fontSize="11" fill={C.soft} fontFamily={MONO}>{max > 0 ? `peak ${fmtUsd(max)}` : ''}</text>
    </svg>
  );
}

export function UsagePage() {
  const [scope, setScope] = useState<Scope>('payer');
  const [rangeDays, setRangeDays] = useState<number>(30);
  const state = useAsync<UsageRow[]>(() => loadUsage(scope), [scope]);

  const view = useMemo(() => {
    const rows = state.data ?? [];
    const end = new Date(); end.setHours(12, 0, 0, 0);
    const days: string[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) { const d = new Date(end); d.setDate(d.getDate() - i); days.push(dayOf(d)); }
    const inRange = new Set(days);
    const picked = rows.filter((r) => inRange.has(r.day));
    const perDay = new Map(days.map((d) => [d, 0]));
    const agents = new Map<string, { name: string; cost: number; calls: number; tokens: number }>();
    const sources = new Map<string, { cost: number; calls: number }>();
    let cost = 0, calls = 0, tokens = 0;
    for (const r of picked) {
      cost += r.cost; calls += r.calls; tokens += r.tokens;
      perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.cost);
      const a = agents.get(r.agent_id) ?? { name: r.agent_name, cost: 0, calls: 0, tokens: 0 };
      a.cost += r.cost; a.calls += r.calls; a.tokens += r.tokens; agents.set(r.agent_id, a);
      const s = sources.get(r.source) ?? { cost: 0, calls: 0 };
      s.cost += r.cost; s.calls += r.calls; sources.set(r.source, s);
    }
    return {
      days, values: days.map((d) => perDay.get(d) ?? 0), cost, calls, tokens,
      byAgent: [...agents.values()].sort((a, b) => b.cost - a.cost),
      bySource: [...sources.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.cost - a.cost),
    };
  }, [state.data, rangeDays]);

  const pill = (active: boolean) => ({ border: `1px solid ${active ? C.ink : C.lineStrong}`, background: active ? C.ink : '#fff', color: active ? C.bg : C.text, borderRadius: 16, padding: '5px 13px', fontSize: 12.5, cursor: 'pointer', fontWeight: 500 }) as const;

  return (
    <TabPage title="Usage" subtitle="What your agents have cost, per day, per agent and per kind of work.">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="group" aria-label="Whose usage" style={{ display: 'flex', gap: 6 }}>
          <button style={pill(scope === 'payer')} onClick={() => setScope('payer')} title="Everything charged to your wallet, including other people's use of agents you pay for">What I pay</button>
          <button style={pill(scope === 'user')} onClick={() => setScope('user')} title="Your own use of any agent, whoever pays for it">What I use</button>
        </div>
        <div role="group" aria-label="Time range" style={{ display: 'flex', gap: 6 }}>
          {RANGES.map((r) => <button key={r.days} style={pill(rangeDays === r.days)} onClick={() => setRangeDays(r.days)}>Last {r.label}</button>)}
        </div>
      </div>

      <Loaded state={state}>
        {() => (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {([['Spend', fmtUsd(view.cost)], ['Model calls', fmtCompact(view.calls)], ['Tokens', fmtCompact(view.tokens)]] as const).map(([label, value]) => (
                <div key={label} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px' }}>
                  <div style={{ fontSize: 12, color: C.soft }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
            <Panel title="Spend per day"><div style={{ padding: '12px 16px 6px' }}><Bars days={view.days} values={view.values} /></div></Panel>
            <Panel title="By agent">
              {view.byAgent.length === 0 ? <Empty>No usage in this period.</Empty> : view.byAgent.map((a, i) => (
                <Row key={a.name + i} last={i === view.byAgent.length - 1} primary={a.name} secondary={`${fmtCompact(a.calls)} calls · ${fmtCompact(a.tokens)} tokens`}
                  right={<><span style={{ width: 120, height: 6, borderRadius: 3, background: C.sunken, overflow: 'hidden', display: 'inline-block' }}><span style={{ display: 'block', height: '100%', width: `${view.cost > 0 ? (a.cost / view.cost) * 100 : 0}%`, background: C.brass }} /></span><span style={{ minWidth: 70, textAlign: 'right', fontSize: 13.5, fontWeight: 500 }}>{fmtUsd(a.cost)}</span></>} />
              ))}
            </Panel>
            <Panel title="By kind of work">
              {view.bySource.length === 0 ? <Empty>No usage in this period.</Empty> : view.bySource.map((s, i) => (
                <Row key={s.key} last={i === view.bySource.length - 1} primary={humanSource(s.key)} secondary={`${fmtCompact(s.calls)} calls`} right={<Chip label={fmtUsd(s.cost)} />} />
              ))}
            </Panel>
          </>
        )}
      </Loaded>
    </TabPage>
  );
}
