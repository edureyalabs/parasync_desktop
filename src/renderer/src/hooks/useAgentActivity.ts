// src/renderer/src/hooks/useAgentActivity.ts
import { useEffect, useRef, useState } from 'react';

import { supabase, topic } from '@/lib/supabase';

// What the assistant is doing right now in this chat. `null` = not running a turn.
export type AgentActivity = { kind: 'thinking' | 'tool'; label: string | null } | null;

interface StepRow {
  id: string;
  step_type: string;
  title: string;
  status: string;
}

/** "mcp__github__list_issues" -> "list issues (github)", "browser_execute" -> "browser execute". */
export function toolLabel(name: string | null): string {
  if (!name) return '';
  const mcp = /^mcp__([^_].*?)__(.+)$/.exec(name);
  const pretty = (s: string) => s.replace(/_/g, ' ');
  return mcp ? `${pretty(mcp[2] ?? '')} (${pretty(mcp[1] ?? '')})` : pretty(name);
}

/**
 * Live thinking / using-a-tool state. The turn itself (`working`) comes from chats.orchestrator_status; the finer
 * detail comes from the step rows the backend writes for every model and tool call. Those rows are readable by the
 * agent's owner only, so for a connected member the avatar simply shows the generic "thinking" state.
 */
export function useAgentActivity(chatId: string | null, working: boolean): AgentActivity {
  const [detail, setDetail] = useState<AgentActivity>(null);
  const currentStep = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId || !working) return;
    let cancelled = false;

    const apply = (row: StepRow) => {
      if (cancelled || (row.step_type !== 'llm_call' && row.step_type !== 'tool_call')) return;
      if (row.status === 'running') {
        currentStep.current = row.id;
        setDetail(row.step_type === 'tool_call' ? { kind: 'tool', label: row.title } : { kind: 'thinking', label: null });
      } else if (currentStep.current === row.id) {
        currentStep.current = null;
        setDetail(null);
      }
    };

    const channel = supabase
      .channel(topic(`agent-activity:${chatId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_activity_log', filter: `chat_id=eq.${chatId}` }, (payload) => {
        if (payload.new && 'id' in payload.new) apply(payload.new as StepRow);
      })
      .subscribe();

    void (async () => {
      const { data } = await supabase
        .from('agent_activity_log')
        .select('id, step_type, title, status')
        .eq('chat_id', chatId)
        .eq('status', 'running')
        .in('step_type', ['llm_call', 'tool_call'])
        .order('started_at', { ascending: false })
        .limit(1);
      const row = (data as StepRow[] | null)?.[0];
      if (row) apply(row);
    })();

    return () => {
      cancelled = true;
      currentStep.current = null;
      setDetail(null);
      void supabase.removeChannel(channel);
    };
  }, [chatId, working]);

  return working ? (detail ?? { kind: 'thinking', label: null }) : null;
}
