// src/renderer/src/views/AgentsView.tsx
import { useMemo, useState } from 'react';

import { Avatar, Center, Chip, ErrorText, SearchField, Spinner } from '@/components/ui';
import { useAgentList } from '@/hooks/useAgentList';
import type { AgentListItem } from '@/lib/agents';
import { useAuth } from '@/lib/auth';
import { listTime, previewText } from '@/lib/chatTime';
import { useNav } from '@/lib/nav';
import { C } from '@/lib/theme';
import { ChatView } from '@/views/ChatView';

function Row({ agent, active, onOpen }: { agent: AgentListItem; active: boolean; onOpen: () => void }) {
  const last = agent.lastMessage;
  const preview = last ? `${last.role === 'user' ? 'You: ' : ''}${previewText(last.content)}` : agent.description || 'No messages yet';
  return (
    <button
      onClick={onOpen} aria-current={active ? 'true' : undefined} className={active ? undefined : 'ps-hover'}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', border: 'none', textAlign: 'left', cursor: 'pointer', background: active ? C.brassBg : 'transparent', color: C.ink }}
    >
      <Avatar name={agent.name} url={agent.avatarUrl} size={46} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: agent.unread ? 700 : 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</span>
          {last && <span style={{ fontSize: 11, color: agent.unread ? C.brass : C.soft, flexShrink: 0 }}>{listTime(last.created_at)}</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: agent.unread ? C.text : C.soft, fontWeight: agent.unread ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
          {agent.networkStatus === 'paused' && <Chip label="Paused" tone="red" />}
          {!agent.active && <Chip label="Off" />}
          {agent.unread && <span aria-label="Unread" style={{ width: 9, height: 9, borderRadius: '50%', background: C.brass, flexShrink: 0 }} />}
        </span>
      </span>
    </button>
  );
}

export function AgentsView() {
  const { session } = useAuth();
  const { agentId, openAgent } = useNav();
  const { agents, error, reload } = useAgentList(session?.user.id, agentId);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !agents) return agents ?? [];
    return agents.filter((a) => a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q));
  }, [agents, query]);

  return (
    <>
      <section style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: `1px solid ${C.line}` }}>
        <div style={{ padding: '18px 16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em' }}>My Agents</h1>
          <SearchField value={query} onChange={setQuery} placeholder="Search agents" />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && <div style={{ padding: '0 16px 10px' }}><ErrorText>{error}</ErrorText></div>}
          {agents === null ? (
            <Center><Spinner size={24} /></Center>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '44px 24px', textAlign: 'center', fontSize: 13, color: C.soft, lineHeight: 1.6 }}>
              {query ? 'No agents match your search.' : 'No agents yet. Add one from Discover, or accept an invitation.'}
              {!query && <div style={{ marginTop: 10 }}><button onClick={() => void reload()} style={{ background: 'none', border: 'none', color: C.brass, cursor: 'pointer', fontSize: 13 }}>Refresh</button></div>}
            </div>
          ) : (
            filtered.map((a) => <Row key={a.id} agent={a} active={a.id === agentId} onOpen={() => openAgent(a.id)} />)
          )}
        </div>
      </section>

      <section style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        {agentId ? (
          <ChatView key={agentId} agentId={agentId} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, textAlign: 'center', color: C.soft, padding: 32 }}>
            <div>
              <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, color: C.ink, marginBottom: 8 }}>Select an agent</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>Pick a conversation on the left to get started.</div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
