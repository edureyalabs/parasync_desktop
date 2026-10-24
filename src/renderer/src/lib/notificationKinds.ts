// src/renderer/src/lib/notificationKinds.ts
// What each kind of notification is called and how its label is coloured (as in the web app). `kind` is open text
// written by the backend, so an unknown kind still renders, with a readable label made from its name.
export interface KindStyle {
  label: string;
  fg: string;
  bg: string;
  border: string;
}

const KINDS: Record<string, KindStyle> = {
  scheduled_task_update: { label: 'Scheduled Task Update', fg: '#7C5F27', bg: '#F3EDDA', border: '#E4D2A0' },
  task_update: { label: 'Task Update', fg: '#3D5A6E', bg: '#E8EEF2', border: '#BFCCD6' },
  shift_update: { label: 'Shift Update', fg: '#3D5A6E', bg: '#E8EEF2', border: '#BFCCD6' },
  shift_report: { label: 'Shift Report', fg: '#4F6B3A', bg: '#E6EDDD', border: '#C5D4B4' },
  project_question: { label: 'Question', fg: '#5B4B8A', bg: '#EAE5F4', border: '#CDC3E3' },
  project_stopped: { label: 'Project Stopped', fg: '#B34A3C', bg: '#F5E6E1', border: '#E3C4BB' },
  needs_attention: { label: 'Needs Attention', fg: '#B34A3C', bg: '#F5E6E1', border: '#E3C4BB' },
};

function humanize(kind: string): string {
  return (
    kind
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Notification'
  );
}

export function kindStyle(kind: string | null | undefined): KindStyle {
  if (kind && KINDS[kind]) return KINDS[kind];
  return { label: humanize(kind ?? ''), fg: '#67655A', bg: '#EDEBE2', border: '#DAD5C5' };
}

/** "3:30 PM". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "just now", "12m ago", "3h ago", "2d ago", then a plain date once it is more than a week old. */
export function formatRelative(iso: string, now: number): string {
  const age = now - new Date(iso).getTime();
  if (age < 45_000) return 'just now';
  if (age < 3_600_000) return `${Math.max(1, Math.round(age / 60_000))}m ago`;
  if (age < 86_400_000) return `${Math.round(age / 3_600_000)}h ago`;
  if (age < 7 * 86_400_000) return `${Math.round(age / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
