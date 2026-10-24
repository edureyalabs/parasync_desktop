// components/agent-header/useAgentActivity.ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// What the assistant is doing right now in this chat, for the header avatar. `null` = not running a turn.
// "thinking" = a model call is in flight; "tool" = a tool call is in flight (label = its name).
export type AgentActivity = { kind: 'thinking' | 'tool'; label: string | null } | null;

interface StepRow { id: string; step_type: string; title: string; status: string }

function fromRow(row: StepRow): AgentActivity {
  return row.step_type === 'tool_call' ? { kind: 'tool', label: row.title } : { kind: 'thinking', label: null };
}

/** "mcp__github__list_issues" -> "list issues (github)", "browser_execute" -> "browser execute". */
export function toolLabel(name: string | null): string {
  if (!name) return '';
  const mcp = /^mcp__([^_].*?)__(.+)$/.exec(name);
  const pretty = (s: string) => s.replace(/_/g, ' ');
  return mcp ? `${pretty(mcp[2])} (${pretty(mcp[1])})` : pretty(name);
}

/**
 * Live thinking / using-a-tool state. The turn itself (`working`) comes from chats.orchestrator_status, the one honest
 * signal; the finer detail comes from the step rows bemain already writes for every model call and tool call
 * (agent_activity_log). Those rows are readable by the agent's owner only, so for a connected member the detail is
 * simply absent and the avatar shows the generic "thinking" state while the turn runs. Never throws: with no detail
 * the result is the generic state.
 */
export function useAgentActivity(chatId: string | null, working: boolean): AgentActivity {
  const [detail, setDetail] = useState<AgentActivity>(null);
  const currentStep = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId || !working) return;
    const supabase = createClient();
    let cancelled = false;

    const apply = (row: StepRow) => {
      if (cancelled || (row.step_type !== 'llm_call' && row.step_type !== 'tool_call')) return;
      if (row.status === 'running') {
        currentStep.current = row.id;
        setDetail(fromRow(row));
      } else if (currentStep.current === row.id) {
        currentStep.current = null;
        setDetail(null);          // between steps: back to the generic "thinking"
      }
    };

    const channel = supabase
      .channel(`agent-activity:${chatId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_activity_log', filter: `chat_id=eq.${chatId}` },
        payload => { if (payload.new && 'id' in payload.new) apply(payload.new as StepRow); })
      .subscribe();

    void (async () => {
      const { data } = await supabase
        .from('agent_activity_log')
        .select('id, step_type, title, status')
        .eq('chat_id', chatId).eq('status', 'running').in('step_type', ['llm_call', 'tool_call'])
        .order('started_at', { ascending: false }).limit(1);
      const row = (data as StepRow[] | null)?.[0];
      if (row) apply(row);
    })();

    return () => {
      cancelled = true;
      currentStep.current = null;
      setDetail(null);          // the turn ended (or the chat changed): forget its last step
      void supabase.removeChannel(channel);
    };
  }, [chatId, working]);

  return working ? (detail ?? { kind: 'thinking', label: null }) : null;
}
