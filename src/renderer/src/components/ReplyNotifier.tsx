// src/renderer/src/components/ReplyNotifier.tsx
// Desktop-only: a Windows notification when an agent answers while the app is in the background (or you are looking at another
// chat). The web app has no equivalent because a browser tab cannot count on being allowed to. It draws nothing.
import { useEffect } from 'react';

import { supabase } from '~/lib/supabase';

const PREVIEW_CHARS = 140;

/** One plain line from a markdown message. */
function preview(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PREVIEW_CHARS);
}

export function ReplyNotifier({ currentAgentId }: { currentAgentId: string | null }) {
  useEffect(() => {
    if (!('Notification' in window)) return;
    const names = new Map<string, { agentId: string; name: string } | null>();

    const channel = supabase
      .channel(`reply-notifier#${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as { chat_id: string; role: string; content: string; private?: boolean | null };
        if (m.role !== 'assistant' || !m.content || m.private) return;
        void (async () => {
          let chat = names.get(m.chat_id);
          if (chat === undefined) {
            const { data } = await supabase.from('chats').select('agent_id, agents(name)').eq('id', m.chat_id).maybeSingle();
            const agent = (data as { agent_id: string; agents: { name: string } | { name: string }[] | null } | null);
            const name = Array.isArray(agent?.agents) ? agent?.agents[0]?.name : agent?.agents?.name;
            chat = agent && name ? { agentId: agent.agent_id, name } : null;
            names.set(m.chat_id, chat);
          }
          if (!chat) return;
          const watching = document.hasFocus() && document.visibilityState === 'visible' && currentAgentId === chat.agentId;
          if (watching) return;
          try {
            const n = new Notification(chat.name, { body: preview(m.content) });
            n.onclick = () => window.focus();
          } catch {
            /* notifications are a convenience */
          }
        })();
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [currentAgentId]);

  return null;
}
