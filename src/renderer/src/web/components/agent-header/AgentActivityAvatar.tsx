// components/agent-header/AgentActivityAvatar.tsx
'use client';

import { AgentAvatar } from '@/components/AgentAvatar';
import { toolLabel, type AgentActivity } from './useAgentActivity';

const GOLD = '#C9A24D';

// While the assistant runs a turn: a slow revolving glow around the avatar, and a small badge at its lower left that
// shows what it is doing (three bouncing dots while it thinks, a turning cog while it uses a tool). Idle = a plain avatar.
export function AgentActivityAvatar({ name, avatarUrl, size = 38, activity }: {
  name: string; avatarUrl: string | null; size?: number; activity: AgentActivity;
}) {
  const badge = Math.round(size * 0.42);
  const title = !activity ? undefined : activity.kind === 'tool'
    ? `Using ${toolLabel(activity.label) || 'a tool'}` : 'Thinking';

  return (
    <div
      title={title} role={activity ? 'status' : undefined} aria-label={title}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <style>{`
        @keyframes psa-spin { to { transform: rotate(360deg); } }
        @keyframes psa-breathe { 0%,100% { opacity: .35; } 50% { opacity: .7; } }
        @keyframes psa-dot { 0%,80%,100% { transform: translateY(0); opacity: .45; } 40% { transform: translateY(-2px); opacity: 1; } }
        @keyframes psa-in { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .psa-anim, .psa-anim * { animation: none !important; } }
      `}</style>

      {activity && (
        <>
          {/* soft halo */}
          <span aria-hidden="true" className="psa-anim" style={{
            position: 'absolute', inset: -6, borderRadius: '50%', background: GOLD, filter: 'blur(8px)',
            animation: 'psa-breathe 3.2s ease-in-out infinite', pointerEvents: 'none',
          }} />
          {/* slow revolving arc */}
          <span aria-hidden="true" className="psa-anim" style={{
            position: 'absolute', inset: -5, borderRadius: '50%', pointerEvents: 'none',
            background: `conic-gradient(from 0deg, transparent 0deg, ${GOLD} 140deg, transparent 150deg, transparent 360deg)`,
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
            animation: 'psa-spin 3.6s linear infinite',
          }} />
        </>
      )}

      <div style={{ position: 'relative' }}>
        <AgentAvatar name={name} avatarUrl={avatarUrl} size={size} ring />
      </div>

      {activity && (
        <span key={activity.kind} aria-hidden="true" className="psa-anim" style={{
          position: 'absolute', left: -5, bottom: -5, width: badge, height: badge, borderRadius: '50%',
          background: '#FBF8EE', border: `1.5px solid ${GOLD}`, boxShadow: '0 1px 3px rgba(38,37,30,0.25)',
          color: '#7C5F27', display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'psa-in .18s ease-out',
        }}>
          {activity.kind === 'tool' ? (
            <svg className="psa-anim" width={badge * 0.66} height={badge * 0.66} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: 'psa-spin 4s linear infinite' }}>
              <circle cx="8" cy="8" r="2.2" />
              <path d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3" />
            </svg>
          ) : (
            <span style={{ display: 'flex', gap: 1.5 }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="psa-anim" style={{
                  width: 2.5, height: 2.5, borderRadius: '50%', background: 'currentColor',
                  animation: `psa-dot 1.2s ease-in-out ${i * 0.16}s infinite`,
                }} />
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
