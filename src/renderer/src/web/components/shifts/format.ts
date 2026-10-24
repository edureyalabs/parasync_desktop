// components/shifts/format.ts
// Times are always shown in the shift's own timezone (the organization's), never the browser's,
// so "10:00" on the screen is the "10:00" the owner wrote in the definition.
import type { Shift, ShiftSpec } from './types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function clockTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));
}

export function dayAndTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

export function dayLabel(runDate: string): string {
  // run_date is a plain calendar date (YYYY-MM-DD); format it without any timezone shift.
  const [y, m, d] = runDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function daysLabel(days: number[] | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${WEEKDAYS[sorted[0]]}–${WEEKDAYS[sorted[sorted.length - 1]]}`;
  return sorted.map(d => WEEKDAYS[d]).join(', ');
}

export function windowSummary(spec: ShiftSpec | null): string {
  if (!spec) return '';
  return `${spec.start_time}–${spec.end_time} · ${daysLabel(spec.days)} · ${spec.wakes.length} scheduled wakes`;
}

export function minutesLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} h ${r} min`;
  return h ? `${h} h` : `${r} min`;
}

export function shiftHeadline(shift: Shift): string {
  return shift.spec?.goal ?? shift.definition;
}
