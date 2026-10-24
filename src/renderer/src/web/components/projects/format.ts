// components/projects/format.ts
/** "Sat 11 Oct, 10:00" in the viewer's own timezone. */
export function when(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

/** "3 hours", "40 minutes", "2 days" until (or since) `value`. */
export function span(value: string, nowMs: number = Date.now()): string {
  const minutes = Math.round(Math.abs(new Date(value).getTime() - nowMs) / 60000);
  if (minutes < 90) return `${Math.max(minutes, 1)} minute${minutes === 1 ? '' : 's'}`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}
