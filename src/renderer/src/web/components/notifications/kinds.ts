// components/notifications/kinds.ts
// What each kind of notification is called and how its label is coloured. The database
// stores `kind` as open text (agent_notifications.kind, written by bemain), so adding a
// new kind of notification is one entry here -- an unknown kind still renders, with a
// readable label made from its name, rather than breaking the feed.

export interface KindStyle {
  label: string;
  fg: string;
  bg: string;
  border: string;
}

const KINDS: Record<string, KindStyle> = {
  // A recurring (cron) task finished a run.
  scheduled_task_update: { label: 'Scheduled Task Update', fg: '#7C5F27', bg: '#F3EDDA', border: '#E4D2A0' },
  // A one-off task whose result was sent to the feed instead of the chat.
  task_update: { label: 'Task Update', fg: '#3D5A6E', bg: '#E8EEF2', border: '#BFCCD6' },
  // A shift's agent told the person something during a shift / a shift ended with its report.
  shift_update: { label: 'Shift Update', fg: '#3D5A6E', bg: '#E8EEF2', border: '#BFCCD6' },
  shift_report: { label: 'Shift Report', fg: '#4F6B3A', bg: '#E6EDDD', border: '#C5D4B4' },
  // Something in a shift needs a person.
  // A project agent needs an answer from the person (the entry carries a box to answer in).
  project_question: { label: 'Question', fg: '#5B4B8A', bg: '#EAE5F4', border: '#CDC3E3' },
  // A project stopped without finishing (failed or ran out of time); the entry carries a Resume button.
  project_stopped: { label: 'Project Stopped', fg: '#B34A3C', bg: '#F5E6E1', border: '#E3C4BB' },
  needs_attention: { label: 'Needs Attention', fg: '#B34A3C', bg: '#F5E6E1', border: '#E3C4BB' },
};

/** "some_new_kind" -> "Some New Kind". */
function humanize(kind: string): string {
  return kind
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'Notification';
}

export function kindStyle(kind: string | null | undefined): KindStyle {
  if (kind && KINDS[kind]) return KINDS[kind];
  return { label: humanize(kind ?? ''), fg: '#67655A', bg: '#EDEBE2', border: '#DAD5C5' };
}
