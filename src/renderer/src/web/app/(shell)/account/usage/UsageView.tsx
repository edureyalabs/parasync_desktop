// app/(shell)/account/usage/UsageView.tsx
'use client';

import { useMemo, useState } from 'react';
import { Btn, Card, CardTitle, Chip, EmptyState } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtCompact, fmtUsd } from '@/components/account/format';
import { AgentTable, BarList, type AgentRowData } from './Breakdowns';
import { CostChart, type ChartMode, type ChartView } from './CostChart';
import { DateRangeMenu, MultiSelect, Segmented, type MultiOption } from './Filters';
import {
  applyFilters, breakdown, buildBuckets, buildSeries, costByAgent, daysBetween, defaultGranularity, granularityAllowed,
  longDay, monthsInWindow, presetRange, previousRange, rankAgents, sourceLabel, summarize, valuesByAgent,
  type Granularity, type RangePreset, type SeriesRow,
} from './model';
import { NEUTRAL_BAR, OTHER_COLOR, seriesColor } from './palette';

// The Usage tab's body: one filter row, then everything below it is the same slice of data --
// headline numbers, the cost chart, the agent comparison, and what generated the spend.
// All slicing happens here, in memory, over the rows the page loaded once; only the scope
// switch (billed to me / used by me) asks the server again.

export type Scope = 'payer' | 'user';

function Kpi({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={{ padding: '1.15rem 1.4rem', minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>{label}</p>
      <div style={{ fontSize: '1.45rem', fontWeight: 500, letterSpacing: '-0.025em', color: C.ink, lineHeight: 1.1 }}>{children}</div>
      {sub && <div style={{ fontSize: '0.74rem', color: C.soft, margin: '0.5rem 0 0', lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

export function UsageView({ rows, windowStart, today, refetching, scope }: {
  rows: SeriesRow[];
  windowStart: string;
  today: string;
  refetching: boolean;
  scope: Scope;
}) {
  const [preset, setPreset] = useState<RangePreset>('last30');
  const [granPick, setGranPick] = useState<Granularity | null>(null);
  const [mode, setMode] = useState<ChartMode>('bars');
  const [view, setView] = useState<ChartView>('chart');
  const [agentIds, setAgentIds] = useState<ReadonlySet<string> | null>(null);
  const [sources, setSources] = useState<ReadonlySet<string> | null>(null);

  const range = useMemo(() => presetRange(preset, today), [preset, today]);
  const days = useMemo(() => daysBetween(range.from, range.to), [range]);
  // The picked grouping only counts while it still makes sense for the period (a year of single days does not).
  const gran = useMemo<Granularity>(
    () => (granPick && granularityAllowed(granPick, days) ? granPick : defaultGranularity(days)),
    [granPick, days],
  );

  const m = useMemo(() => {
    const filters = { range, agentIds, sources };
    const agents = rankAgents(rows);                                   // ranked over the whole window: colours never shift
    const buckets = buildBuckets(range, gran);
    const filtered = applyFilters(rows, filters);
    const series = buildSeries(filtered, buckets, agents);
    const summary = summarize(rows, filters, today, windowStart);

    const prev = previousRange(range);
    const prevCosts = prev.from >= windowStart ? costByAgent(applyFilters(rows, filters, prev)) : null;
    const trends = valuesByAgent(filtered, buckets);
    const metaById = new Map(agents.map(a => [a.id, a] as const));
    const agentRows: AgentRowData[] = breakdown(filtered, r => r.agent_id, r => r.agent_name).map(slice => {
      const meta = metaById.get(slice.key);
      return {
        id: slice.key, name: slice.label, color: meta && meta.slot !== null ? seriesColor(meta.slot) : OTHER_COLOR, slice,
        trend: trends.get(slice.key) ?? [], previous: prevCosts ? (prevCosts.get(slice.key) ?? 0) : null,
      };
    });

    const allSources = breakdown(rows, r => r.source, r => sourceLabel(r.source));
    return {
      agents, buckets, series, summary, agentRows,
      sourceSlices: breakdown(filtered, r => r.source, r => sourceLabel(r.source)),
      agentOptions: agents.map<MultiOption>(a => ({ id: a.id, label: a.name, color: a.slot !== null ? seriesColor(a.slot) : OTHER_COLOR, hint: fmtUsd(a.total) })),
      sourceOptions: allSources.map<MultiOption>(s => ({ id: s.key, label: s.label, hint: fmtUsd(s.cost) })),
    };
  }, [rows, range, gran, agentIds, sources, today, windowStart]);

  const months = useMemo(() => monthsInWindow(windowStart, today), [windowStart, today]);
  const filtersActive = agentIds !== null || sources !== null;
  const { summary } = m;

  if (rows.length === 0) {
    return (
      <Card pad="0">
        <EmptyState
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18V8M9 18V4M15 18v-7M21 18H1" /></svg>}
          title={scope === 'payer' ? 'Nothing has been charged to your wallet yet' : 'You have not used any agents yet'}
        >
          {scope === 'payer'
            ? 'Once an agent you pay for answers a message or runs a task, its cost will show up here, day by day.'
            : 'Calls you make to any agent, and anything an agent does for you in the background, will show up here.'}
        </EmptyState>
      </Card>
    );
  }

  const changeChip = (() => {
    if (summary.previousTotal === null) return <span style={{ color: C.muted }}>Earlier data is not available to compare</span>;
    if (summary.change === null) return summary.total > 0
      ? <><Chip tone="slate">New</Chip> <span>nothing was spent in the previous {summary.previousDays} days</span></>
      : <span style={{ color: C.muted }}>No spend in this or the previous period</span>;
    const up = summary.change > 0;
    const flat = Math.abs(summary.change) < 0.005;
    return (
      <>
        <Chip tone={flat ? 'neutral' : up ? 'amber' : 'green'}>{flat ? 'Flat' : `${up ? '▲' : '▼'} ${Math.abs(Math.round(summary.change * 100)).toLocaleString()}%`}</Chip>
        {' '}<span>vs previous {summary.previousDays} days ({fmtUsd(summary.previousTotal)})</span>
      </>
    );
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* One filter row; everything below is scoped by it */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem 0.75rem' }}>
        <DateRangeMenu preset={preset} rangeLabel={range.label} months={months} onChange={setPreset} />
        <Segmented<Granularity>
          label="Group by" value={gran} onChange={setGranPick}
          options={[
            { value: 'day', label: 'Day', disabled: !granularityAllowed('day', days), title: granularityAllowed('day', days) ? undefined : 'Too many days to show one bar each' },
            { value: 'week', label: 'Week', disabled: !granularityAllowed('week', days), title: granularityAllowed('week', days) ? undefined : 'Period is shorter than two weeks' },
            { value: 'month', label: 'Month', disabled: !granularityAllowed('month', days), title: granularityAllowed('month', days) ? undefined : 'Period is shorter than two months' },
          ]}
        />
        <MultiSelect caption="Agents" noun="agent" options={m.agentOptions} selected={agentIds} onChange={setAgentIds} />
        <MultiSelect caption="Source" noun="source" options={m.sourceOptions} selected={sources} onChange={setSources} />
        {filtersActive && <Btn size="sm" variant="ghost" onClick={() => { setAgentIds(null); setSources(null); }}>Clear filters</Btn>}
      </div>

      {/* Headline numbers */}
      <Card pad="0" style={{ overflow: 'hidden', opacity: refetching ? 0.55 : 1, transition: 'opacity 0.2s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <div style={{ gridColumn: 'span 1', background: `linear-gradient(180deg, ${C.brassTint} 0%, #fff 100%)` }}>
            <Kpi label={`Total spend · ${range.label}`} sub={<span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>{changeChip}</span>}>
              <span style={{ fontSize: '3rem', letterSpacing: '-0.035em' }}>{fmtUsd(summary.total)}</span>
            </Kpi>
          </div>
          <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
            <Kpi label="Daily average" sub={`over ${summary.elapsedDays} day${summary.elapsedDays === 1 ? '' : 's'}`}>{fmtUsd(summary.dailyAverage)}</Kpi>
          </div>
          <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
            <Kpi label="Busiest day" sub={summary.peakDay ? longDay(summary.peakDay.day) : 'no spend yet'}>{summary.peakDay ? fmtUsd(summary.peakDay.cost) : '—'}</Kpi>
          </div>
          <div style={{ borderLeft: `1px solid ${C.lineSoft}` }}>
            <Kpi label="Model calls" sub={summary.calls > 0 ? `${fmtUsd(summary.total / summary.calls)} per call · ${fmtCompact(summary.promptTokens + summary.completionTokens)} tokens` : 'none in this period'}>{summary.calls.toLocaleString()}</Kpi>
          </div>
        </div>
      </Card>

      {/* Cost over time */}
      <Card>
        <CardTitle
          aside={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Segmented<ChartMode> size="sm" label="Chart type" value={mode} onChange={setMode} options={[
                { value: 'bars', label: 'Bars', title: 'Spend per period, stacked by agent' },
                { value: 'lines', label: 'Lines', title: 'One line per agent, to compare them' },
                { value: 'cumulative', label: 'Running total', title: 'How spend adds up over the period' },
              ]} />
              <Segmented<ChartView> size="sm" label="View" value={view} onChange={setView} options={[
                { value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' },
              ]} />
            </div>
          }
        >
          Cost over time
        </CardTitle>
        <p style={{ fontSize: '0.76rem', color: C.soft, margin: '-0.4rem 0 1rem' }}>
          Spend in US dollars per {gran}, {range.label.toLowerCase()}{agentIds || sources ? ' (filtered)' : ''}.
        </p>
        <CostChart buckets={m.buckets} series={m.series} mode={mode} view={view} dimmed={refetching} />
      </Card>

      {/* Agents compared, then where the spend came from */}
      <div style={{ opacity: refetching ? 0.55 : 1, transition: 'opacity 0.2s' }}>
        <AgentTable rows={m.agentRows} previousLabel={`Spend compared with the previous ${summary.previousDays} days`} />
      </div>
      <div style={{ opacity: refetching ? 0.55 : 1, transition: 'opacity 0.2s' }}>
        <BarList title="Spend by source" subtitle="What generated it" slices={m.sourceSlices} color={() => NEUTRAL_BAR} empty="No spend in this period." />
      </div>
    </div>
  );
}
