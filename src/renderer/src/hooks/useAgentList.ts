// src/renderer/src/hooks/useAgentList.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { loadAgentList, type AgentListItem } from '@/lib/agents';
import { previewText } from '@/lib/chatTime';
import { supabase, topic } from '@/lib/supabase';

interface State {
  agents: AgentListItem[] | null;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Every agent this person owns or is connected to, with the last message of each chat. Refreshes when a message
 * arrives (a short pause batches bursts), when the window regains focus, and on a slow timer as a safety net for a
 * PC that slept. A reply in a chat that is not open raises a Windows notification.
 */
export function useAgentList(userId: string | undefined, openAgentId: string | null): State {
  const [agents, setAgents] = useState<AgentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agentsRef = useRef<AgentListItem[] | null>(null);
  const openRef = useRef(openAgentId);
  const chatsSeen = useRef<Set<string>>(new Set());
  useEffect(() => { openRef.current = openAgentId; }, [openAgentId]);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await loadAgentList(userId);
      agentsRef.current = next;
      chatsSeen.current = new Set(next.map((a) => a.chatId).filter((c): c is string => !!c));
      setAgents(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your agents.');
      setAgents((a) => a ?? []);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (!cancelled) void reload(); }, 800);
    };

    void reload();

    const channel = supabase
      .channel(topic('agent-list'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as { chat_id: string; role: string; content: string; private?: boolean | null };
        if (!m.private && m.role === 'assistant' && m.content && chatsSeen.current.has(m.chat_id)) {
          const agent = agentsRef.current?.find((a) => a.chatId === m.chat_id);
          const hidden = document.visibilityState !== 'visible' || !document.hasFocus();
          if (agent && (hidden || openRef.current !== agent.id) && 'Notification' in window && Notification.permission !== 'denied') {
            try {
              const n = new Notification(agent.name, { body: previewText(m.content).slice(0, 140), silent: false });
              n.onclick = () => window.focus();
            } catch {
              /* notifications are a convenience */
            }
          }
        }
        soon();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_network' }, soon)
      .subscribe();

    const onFocus = () => soon();
    window.addEventListener('focus', onFocus);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, 120_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [userId, reload]);

  return { agents, error, reload };
}
