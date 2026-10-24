// app/(shell)/account/usage/model.ts
// The Usage tab's data model: pure functions, no React, no I/O. Everything here works on
// calendar days written "YYYY-MM-DD" in the VIEWER'S timezone (the server buckets rows into
// those days for us -- see account_usage_series), so a range, a bucket and a row all speak
// the same day strings and compare lexicographically.

// ─── Rows ───────────────────────────────────────────────────────────────────

/** One server-side aggregate: everything spent on one day by one agent, from one source. */
export interface SeriesRow {
  day: string;
  agent_id: string;
  agent_name: string;
  source: string;
  cost: number;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export const UNKNOWN_AGENT_ID = 'unknown';
const UNKNOWN_AGENT_NAME = 'Deleted agent';

/** PostgREST returns numeric/bigint columns as strings or numbers depending on size. */
export function parseRow(raw: Record<string, unknown>): SeriesRow {
  return {
    day: String(raw.day).slice(0, 10),
    agent_id: raw.agent_id ? String(raw.agent_id) : UNKNOWN_AGENT_ID,
    agent_name: raw.agent_name ? String(raw.agent_name) : UNKNOWN_AGENT_NAME,
    source: raw.source ? String(raw.source) : 'chat',
    cost: Number(raw.cost) || 0,
    calls: Number(raw.calls) || 0,
    prompt_tokens: Number(raw.prompt_tokens) || 0,
    completion_tokens: Number(raw.completion_tokens) || 0,
  };
}

// ─── Calendar days ──────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** A local Date for a day string, at noon so a DST shift can never move it onto another day. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
}

/** Inclusive count of days in [from, to]. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000) + 1;
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: string): string {
  const d = parseDay(monthStart(day));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return dayOf(d);
}

export function addMonths(monthDay: string, n: number): string {
  const d = parseDay(monthStart(monthDay));
  d.setMonth(d.getMonth() + n);
  return dayOf(d);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const d = parseDay(day);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return dayOf(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Oct 3" */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Fri, Oct 3" */
export function longDay(day: string): string {
  return `${WEEKDAYS[parseDay(day).getDay()]}, ${shortDay(day)}`;
}

/** "October 2026" for a "YYYY-MM-DD" or "YYYY-MM". */
export function monthLabel(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

// ─── Date range ─────────────────────────────────────────────────────────────

/** 'last7' | 'last30' | 'last90' | 'thisMonth' | 'last12m' | 'm:2026-09' */
export type RangePreset = string;

export interface DateRange {
  from: string; // inclusive
  to: string;   // inclusive
  label: string;
}

export function presetRange(preset: RangePreset, today: string): DateRange {
  switch (preset) {
    case 'last7': return { from: addDays(today, -6), to: today, label: 'Last 7 days' };
    case 'last90': return { from: addDays(today, -89), to: today, label: 'Last 90 days' };
    case 'last12m': return { from: addDays(today, -364), to: today, label: 'Last 12 months' };
    case 'thisMonth': return { from: monthStart(today), to: today, label: 'This month' };
    default:
      if (preset.startsWith('m:')) {
        const first = `${preset.slice(2)}-01`;
        const last = monthEnd(first);
        return { from: first, to: last < today ? last : today, label: monthLabel(first) };
      }
      return { from: addDays(today, -29), to: today, label: 'Last 30 days' };
  }
}

/** The calendar months (newest first) the fetched window covers, for the month picker. */
export function monthsInWindow(windowStart: string, today: string): string[] {
  const out: string[] = [];
  for (let m = monthStart(today); m >= monthStart(windowStart); m = addMonths(m, -1)) out.push(m.slice(0, 7));
  return out;
}

// ─── Buckets (the x axis) ───────────────────────────────────────────────────

export type Granularity = 'day' | 'week' | 'month';

export interface Bucket {
  key: string;
  start: string; // inclusive, clipped to the range
  end: string;   // inclusive, clipped to the range
  label: string; // tooltip / table heading
  short: string; // axis tick
}

export function defaultGranularity(days: number): Granularity {
  return days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
}

/** Which groupings make sense for a range of `days`: not 300 hairline bars, not a single fat one. */
export function granularityAllowed(g: Granularity, days: number): boolean {
  if (g === 'day') return days <= 120;
  if (g === 'week') return days >= 14;
  return days >= 45;
}

export function buildBuckets(range: DateRange, g: Granularity): Bucket[] {
  const buckets: Bucket[] = [];
  if (g === 'day') {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      buckets.push({ key: d, start: d, end: d, label: longDay(d), short: shortDay(d) });
    }
  } else if (g === 'week') {
    for (let ws = weekStart(range.from); ws <= range.to; ws = addDays(ws, 7)) {
      const start = ws < range.from ? range.from : ws;
      const we = addDays(ws, 6);
      const end = we > range.to ? range.to : we;
      buckets.push({ key: ws, start, end, label: start === end ? longDay(start) : `${shortDay(start)} – ${shortDay(end)}`, short: shortDay(start) });
    }
  } else {
    const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
    for (let ms = monthStart(range.from); ms <= range.to; ms = addMonths(ms, 1)) {
      const start = ms < range.from ? range.from : ms;
      const me = monthEnd(ms);
      const end = me > range.to ? range.to : me;
      const [y, m] = ms.split('-').map(Number);
      buckets.push({ key: ms.slice(0, 7), start, end, label: monthLabel(ms), short: multiYear ? `${MONTHS[m - 1]} '${String(y).slice(2)}` : MONTHS[m - 1] });
    }
  }
  return buckets;
}

/** day string -> index of the bucket that contains it (undefined outside the range). */
export function bucketIndex(buckets: Bucket[]): (day: string) => number | undefined {
  const byDay = new Map<string, number>();
  buckets.forEach((b, i) => {
    for (let d = b.start; d <= b.end; d = addDays(d, 1)) byDay.set(d, i);
  });
  return day => byDay.get(day);
}

// ─── Agents and their colours ───────────────────────────────────────────────

/** How many agents get their own colour; the rest fold into "Other agents". */
export const MAX_NAMED_AGENTS = 7;
export const OTHER_KEY = 'other';

export interface AgentMeta {
  id: string;
  name: string;
  /** Colour slot (0-6), or null when the agent is folded into "Other". */
  slot: number | null;
  total: number;
}

/**
 * Rank agents by all-time spend in the fetched window and hand the top few a colour slot.
 * Ranked over the WHOLE window, never the current filter or range, so an agent keeps its
 * colour as filters change: colour follows the agent, not its position in today's chart.
 */
export function rankAgents(rows: SeriesRow[]): AgentMeta[] {
  const byId = new Map<string, AgentMeta>();
  for (const r of rows) {
    const agent = byId.get(r.agent_id) ?? { id: r.agent_id, name: r.agent_name, slot: null, total: 0 };
    agent.total += r.cost;
    byId.set(r.agent_id, agent);
  }
  const ranked = [...byId.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  ranked.forEach((agent, i) => { agent.slot = i < MAX_NAMED_AGENTS ? i : null; });
  return ranked;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface Filters {
  range: DateRange;
  /** null = every agent. */
  agentIds: ReadonlySet<string> | null;
  /** null = every source. */
  sources: ReadonlySet<string> | null;
}

export function inRange(row: SeriesRow, from: string, to: string): boolean {
  return row.day >= from && row.day <= to;
}

export function applyFilters(rows: SeriesRow[], f: Filters, range: { from: string; to: string } = f.range): SeriesRow[] {
  return rows.filter(r =>
    inRange(r, range.from, range.to)
    && (f.agentIds === null || f.agentIds.has(r.agent_id))
    && (f.sources === null || f.sources.has(r.source)),
  );
}

// ─── Series for the chart ───────────────────────────────────────────────────

export interface Series {
  key: string;            // agent id, or OTHER_KEY
  label: string;
  slot: number | null;    // colour slot; null = the neutral "Other" colour
  values: number[];       // cost per bucket
  total: number;
  calls: number;
}

/** One series per coloured agent that has spend in view, plus one "Other agents" series. */
export function buildSeries(rows: SeriesRow[], buckets: Bucket[], agents: AgentMeta[]): Series[] {
  const slotOf = new Map(agents.map(a => [a.id, a] as const));
  const indexOf = bucketIndex(buckets);
  const series = new Map<string, Series>();

  for (const r of rows) {
    const i = indexOf(r.day);
    if (i === undefined) continue;
    const meta = slotOf.get(r.agent_id);
    const key = meta && meta.slot !== null ? meta.id : OTHER_KEY;
    let s = series.get(key);
    if (!s) {
      s = { key, label: key === OTHER_KEY ? 'Other agents' : (meta?.name ?? r.agent_name), slot: key === OTHER_KEY ? null : meta!.slot, values: new Array(buckets.length).fill(0), total: 0, calls: 0 };
      series.set(key, s);
    }
    s.values[i] += r.cost;
    s.total += r.cost;
    s.calls += r.calls;
  }
  // Colour order first (slot 0..6), "Other agents" last: a stable stacking order.
  return [...series.values()].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
}

/** Running total across the buckets. */
export function cumulative(values: number[]): number[] {
  let sum = 0;
  return values.map(v => (sum += v));
}

export function bucketTotals(series: Series[], n: number): number[] {
  const totals = new Array<number>(n).fill(0);
  for (const s of series) s.values.forEach((v, i) => { totals[i] += v; });
  return totals;
}

// ─── Headline numbers ───────────────────────────────────────────────────────

export interface Summary {
  total: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** Days of the range that have happened so far (a range ending in the future is not averaged over it). */
  elapsedDays: number;
  dailyAverage: number;
  peakDay: { day: string; cost: number } | null;
  /** Spend over the same number of days immediately before the range; null when that is outside the fetched data. */
  previousTotal: number | null;
  /** Fractional change vs the previous period (0.25 = up 25%); null when there is nothing to compare. */
  change: number | null;
  previousDays: number;
}

export function summarize(rows: SeriesRow[], f: Filters, today: string, windowStart: string): Summary {
  const inView = applyFilters(rows, f);
  let total = 0, calls = 0, promptTokens = 0, completionTokens = 0;
  const byDay = new Map<string, number>();
  for (const r of inView) {
    total += r.cost; calls += r.calls; promptTokens += r.prompt_tokens; completionTokens += r.completion_tokens;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.cost);
  }

  let peakDay: Summary['peakDay'] = null;
  for (const [day, cost] of byDay) if (!peakDay || cost > peakDay.cost) peakDay = { day, cost };

  const elapsedDays = daysBetween(f.range.from, f.range.to < today ? f.range.to : today);
  const length = daysBetween(f.range.from, f.range.to);
  const prev = { from: addDays(f.range.from, -length), to: addDays(f.range.from, -1) };
  const previousTotal = prev.from >= windowStart
    ? applyFilters(rows, f, prev).reduce((sum, r) => sum + r.cost, 0)
    : null;

  return {
    total, calls, promptTokens, completionTokens,
    elapsedDays: Math.max(1, elapsedDays),
    dailyAverage: total / Math.max(1, elapsedDays),
    peakDay,
    previousTotal,
    change: previousTotal !== null && previousTotal > 0 ? (total - previousTotal) / previousTotal : null,
    previousDays: length,
  };
}

// ─── Breakdowns ─────────────────────────────────────────────────────────────

export interface Slice {
  key: string;
  label: string;
  cost: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  share: number; // of the total in view, 0..1
}

export function breakdown(rows: SeriesRow[], keyOf: (r: SeriesRow) => string, labelOf: (r: SeriesRow) => string): Slice[] {
  const slices = new Map<string, Slice>();
  let total = 0;
  for (const r of rows) {
    const key = keyOf(r);
    const s = slices.get(key) ?? { key, label: labelOf(r), cost: 0, calls: 0, promptTokens: 0, completionTokens: 0, share: 0 };
    s.cost += r.cost; s.calls += r.calls; s.promptTokens += r.prompt_tokens; s.completionTokens += r.completion_tokens;
    total += r.cost;
    slices.set(key, s);
  }
  for (const s of slices.values()) s.share = total > 0 ? s.cost / total : 0;
  return [...slices.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls || a.label.localeCompare(b.label));
}

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  task_planning: 'Task planning',
  task_run: 'Task runs',
  scheduled_task: 'Scheduled tasks',
  shift_run: 'Shifts',
  shift_planning: 'Shift planning',
  project_run: 'Projects',
  tool_test: 'Tool tests',
  unknown: 'Other',
  // Retired kinds that still appear on old rows.
  subagent_run: 'Sub-agent runs',
  subagent_escalation: 'Sub-agent escalations',
  subagent_finalization: 'Sub-agent wrap-ups',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());
}

// ─── Per-agent helpers (the comparison table) ───────────────────────────────

/** The equally long stretch of days immediately before `range`. */
export function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const length = daysBetween(range.from, range.to);
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

/** Cost per bucket for EVERY agent (not just the coloured ones): the data behind each row's trend. */
export function valuesByAgent(rows: SeriesRow[], buckets: Bucket[]): Map<string, number[]> {
  const indexOf = bucketIndex(buckets);
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const i = indexOf(r.day);
    if (i === undefined) continue;
    let values = out.get(r.agent_id);
    if (!values) { values = new Array(buckets.length).fill(0); out.set(r.agent_id, values); }
    values[i] += r.cost;
  }
  return out;
}

export function costByAgent(rows: SeriesRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.agent_id, (out.get(r.agent_id) ?? 0) + r.cost);
  return out;
}

/** Squash a long series into at most `points` bars by summing neighbours (for a sparkline). */
export function downsample(values: number[], points: number): number[] {
  if (values.length <= points) return values;
  const out = new Array<number>(points).fill(0);
  values.forEach((v, i) => { out[Math.min(points - 1, Math.floor((i * points) / values.length))] += v; });
  return out;
}
