// components/notifications/format.ts
// Time formatting for the notification timeline: a clock time and a relative age on
// every entry, plus the day headings that group the rail. Everything renders in the
// viewer's own locale and timezone.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3:30 PM" -- the time of day an entry was pushed. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "just now", "12m ago", "3h ago", "2d ago", then a plain date once it is more than a week old. */
export function formatRelative(iso: string, now: number): string {
  const age = now - new Date(iso).getTime();
  if (age < 45_000) return 'just now';
  if (age < HOUR) return `${Math.max(1, Math.round(age / MINUTE))}m ago`;
  if (age < DAY) return `${Math.round(age / HOUR)}h ago`;
  if (age < 7 * DAY) return `${Math.round(age / DAY)}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** The full, unambiguous timestamp -- shown as a tooltip. */
export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
}

function localDayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** A stable key for "which local calendar day is this" -- used to start a new group. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday", "Mon, 29 Sep" (with the year once it is not this year). */
export function dayLabel(iso: string, now: number): string {
  const days = Math.round((localDayStart(now) - localDayStart(new Date(iso).getTime())) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const sameYear = new Date(iso).getFullYear() === new Date(now).getFullYear();
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
  });
}
