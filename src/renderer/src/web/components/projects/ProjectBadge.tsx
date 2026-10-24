// components/projects/ProjectBadge.tsx
import { MONO, PROJECT_BG, PROJECT_FG, PROJECT_LINE } from './tokens';

// The "Project" / "Follow-up" badge, used on the Active card and the History row so projects are easy to tell from tasks and shifts.
export default function ProjectBadge({ followup = false }: { followup?: boolean }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: '0.64rem', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 3, color: PROJECT_FG, background: PROJECT_BG, border: `1px solid ${PROJECT_LINE}`, whiteSpace: 'nowrap' }}>
      {followup ? 'Follow-up' : 'Project'}
    </span>
  );
}
