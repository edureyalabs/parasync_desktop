// components/agent-header/WorkCounts.tsx
'use client';

import Link from 'next/link';
import { useWorkCounts, type Count } from './useWorkCounts';

const MONO = "'IBM Plex Mono', monospace";

function plural(n: number, one: string, many: string) { return n === 1 ? one : many; }

function Pill({ href, label, icon, count, noun, nouns }: {
  href: string; label: string; icon: React.ReactNode; count: Count; noun: string; nouns: string;
}) {
  const total = count.running + count.scheduled;
  if (total === 0) return null;
  const parts = [
    count.running > 0 ? `${count.running} running` : null,
    count.scheduled > 0 ? `${count.scheduled} scheduled` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Link
      href={href} title={`${total} ${plural(total, noun, nouns)}: ${parts}`} aria-label={`${label}: ${parts}`}
      onClick={e => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.22rem 0.5rem', borderRadius: 6, textDecoration: 'none',
        background: count.running > 0 ? '#FBF3DD' : '#F3F1E8', border: `1px solid ${count.running > 0 ? '#E4D2A0' : '#E2DFD3'}`,
        color: count.running > 0 ? '#7C5F27' : '#67655A', fontFamily: MONO, fontSize: '0.64rem', lineHeight: 1.2, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'flex', opacity: 0.85 }}>{icon}</span>
      <span style={{ fontWeight: 500 }}>{total} {plural(total, noun, nouns)}</span>
      {count.running > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span className="pwc-pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: '#C9A24D' }} />{count.running}
        </span>
      )}
      {count.scheduled > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#8A8878' }}>
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.3 1.5" />
          </svg>
          {count.scheduled}
        </span>
      )}
    </Link>
  );
}

const svg = (children: React.ReactNode) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

// Tasks / shifts / projects that are active for this person and agent, in the chat header: a gold dot + number for what is
// running, a clock + number for what is scheduled. Each links to the Runsheet, where they are listed. Nothing active = nothing shown.
export function WorkCounts({ agentId }: { agentId: string }) {
  const { tasks, shifts, projects } = useWorkCounts(agentId);
  const runsheet = `/agents/${agentId}/crons`;
  if (tasks.running + tasks.scheduled + shifts.running + shifts.scheduled + projects.running + projects.scheduled === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
      <style>{`
        @keyframes pwc-pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        .pwc-pulse { animation: pwc-pulse 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pwc-pulse { animation: none; } }
      `}</style>
      <Pill href={runsheet} label="Tasks" noun="task" nouns="tasks" count={tasks}
        icon={svg(<><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8.2l1.8 1.8 3.3-3.6" /></>)} />
      <Pill href={runsheet} label="Shifts" noun="shift" nouns="shifts" count={shifts}
        icon={svg(<><circle cx="8" cy="8" r="5.6" /><path d="M8 4.8V8l2.2 1.4" /></>)} />
      <Pill href={runsheet} label="Projects" noun="project" nouns="projects" count={projects}
        icon={svg(<><path d="M2 4.5h4l1.2 1.5H14v6.5H2z" /></>)} />
    </div>
  );
}
