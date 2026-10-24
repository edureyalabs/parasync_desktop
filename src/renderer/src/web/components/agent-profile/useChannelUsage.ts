// components/agent-profile/useChannelUsage.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { WA_TOOL_KEYS } from '@/lib/whatsapp';

// How much of its sending allowance the agent has used over the last 24 hours, for the two messaging tools, so the Agent Profile can show a bar for each.
// Only the owner can read this (RLS on the settings, email and WhatsApp tables), and a channel is reported only while its platform tool is switched on:
// null means "not in use", so the profile shows nothing for it.
//   email    -- recipients emailed (failed sends excluded) against the daily limit the owner set on the Emails tab
//   whatsapp -- messages sent (sending or sent) against the daily send limit set on the WhatsApp tab; plus what reading has to work with

export interface EmailUsage { used: number; cap: number; suspended: boolean }
export interface WhatsAppUsage {
  used: number;
  cap: number;
  linked: boolean;
  phone: string | null;
  status: string | null;
  chatsRead: number;
  chatsSend: number;
  messagesStored: number;
}

const DEFAULT_EMAIL_CAP = 50;
const DEFAULT_WA_CAP = 50;

export function useChannelUsage(agentId: string | undefined, enabled: boolean) {
  const [email, setEmail] = useState<EmailUsage | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsAppUsage | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!agentId || !enabled) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: tools } = await supabase.from('agent_platform_tools').select('tool_key, enabled').eq('agent_id', agentId).eq('enabled', true);
      const on = new Set(((tools as { tool_key: string }[] | null) ?? []).map(t => t.tool_key));

      let emailUsage: EmailUsage | null = null;
      if (on.has('send_email')) {
        const [settings, sent] = await Promise.all([
          supabase.from('agent_email_settings').select('daily_cap, suspended').eq('agent_id', agentId).maybeSingle(),
          supabase.from('agent_emails').select('to_addresses').eq('agent_id', agentId).gte('created_at', dayAgo).neq('status', 'failed').limit(1000),
        ]);
        emailUsage = {
          used: ((sent.data as { to_addresses: string[] | null }[] | null) ?? []).reduce((n, r) => n + (r.to_addresses?.length ?? 0), 0),
          cap: (settings.data as { daily_cap: number } | null)?.daily_cap ?? DEFAULT_EMAIL_CAP,
          suspended: !!(settings.data as { suspended: boolean } | null)?.suspended,
        };
      }

      let waUsage: WhatsAppUsage | null = null;
      if (WA_TOOL_KEYS.some(k => on.has(k))) {
        const { data: conn } = await supabase.from('wa_connection_status').select('status, phone_number, messages_stored').eq('agent_id', agentId).maybeSingle();
        const c = conn as { status: string; phone_number: string | null; messages_stored: number } | null;
        const phone = c?.phone_number ?? null;
        const chats = (access: string[]) => {
          const q = supabase.from('wa_chats').select('id', { count: 'exact', head: true }).eq('agent_id', agentId).eq('active', true).in('access', access);
          return phone ? q.eq('wa_phone', phone) : q.eq('id', '00000000-0000-0000-0000-000000000000');
        };
        const [settings, sent, read, send] = await Promise.all([
          supabase.from('wa_settings').select('daily_send_cap').eq('agent_id', agentId).maybeSingle(),
          supabase.from('wa_outbox').select('id', { count: 'exact', head: true }).eq('agent_id', agentId).in('status', ['sending', 'sent']).gte('created_at', dayAgo),
          chats(['read', 'both']),
          chats(['send', 'both']),
        ]);
        waUsage = {
          used: sent.count ?? 0,
          cap: (settings.data as { daily_send_cap: number } | null)?.daily_send_cap ?? DEFAULT_WA_CAP,
          linked: !!phone, phone, status: c?.status ?? null,
          chatsRead: phone ? read.count ?? 0 : 0, chatsSend: phone ? send.count ?? 0 : 0, messagesStored: Number(c?.messages_stored ?? 0),
        };
      }

      if (cancelled) return;
      setEmail(emailUsage);
      setWhatsapp(waUsage);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, enabled]);

  return { email, whatsapp, loading };
}
