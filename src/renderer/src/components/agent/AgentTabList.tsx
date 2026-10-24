// src/renderer/src/components/agent/AgentTabList.tsx
// While an agent's settings are open, the left column swaps from the chat list to this vertical list of its tabs, as in the web app.
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui';
import type { AgentDetail } from '@/hooks/useAgentRole';
import { C } from '@/lib/theme';
import type { TabDef, TabKey } from '@/views/agent/tabs';

export function AgentTabList({ agent, tabs, active, onPick, onBack }: { agent: AgentDetail | null; tabs: TabDef[]; active: TabKey; onPick: (key: TabKey) => void; onBack: () => void }) {
  return (
    <section style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: `1px solid ${C.line}` }}>
      <div style={{ padding: '14px 12px 12px', borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onBack} className="ps-hover" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', borderRadius: 6, padding: '5px 8px', marginBottom: 10, cursor: 'pointer', fontSize: 12.5, color: C.muted }}>
          <Icon name="chat" size={14} /> Back to chat
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 6px' }}>
          {agent && <Avatar name={agent.name} url={agent.avatar_url} size={44} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent?.name ?? 'Agent'}</div>
            <div style={{ fontSize: 12, color: C.soft }}>Settings and details</div>
          </div>
        </div>
      </div>
      <nav aria-label="Agent settings" style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key} onClick={() => onPick(t.key)} aria-current={on ? 'page' : undefined} className={on ? undefined : 'ps-hover'}
              style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: 8, padding: '10px 12px', marginBottom: 2, cursor: 'pointer', fontSize: 13.5, fontWeight: on ? 600 : 500, color: on ? C.ink : C.text, background: on ? C.brassBg : 'transparent' }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
