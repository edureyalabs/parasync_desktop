// app/(shell)/agents/[id]/browser-access/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { TabHeader, HeaderButton } from '@/components/agent-ui/TabHeader';
import { AccessCard } from '@/components/browser-access/AccessCard';
import { AddModal } from '@/components/browser-access/Modals';
import { ACCESS_COLUMNS, type Access } from '@/components/browser-access/types';
import { BA_CSS, IconTile, Spinner } from '@/components/browser-access/ui';
import type { IconName } from '@/components/icons/Icon';
import { C } from '@/components/account/tokens';

// Browser Access: websites that need a login, which the agent may use without ever being handed the password. The page is the list; everything about one site
// (setup progress, the manual agents read, learned skills, rules) lives in components/browser-access and opens from that site's "Manage" button.

const HOW: { icon: IconName; title: string; text: string }[] = [
  { icon: 'globe', title: 'Add the site', text: 'Give its name and login page address.' },
  { icon: 'key-round', title: 'Enter your details', text: 'An assistant reads the page and asks for them in a secure form. It never sees them.' },
  { icon: 'book-open', title: 'It learns the site', text: 'It signs in and writes a short manual. Agents then get a signed-in browser as a tool.' },
];

export default function BrowserAccessPage() {
  const { agentId, agent } = useAgentCtx();
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const isShared = !!agent?.visibility && agent.visibility !== 'personal';

  useEffect(() => {
    if (!agentId) return;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.from('browser_accesses').select(ACCESS_COLUMNS).eq('agent_id', agentId).order('created_at', { ascending: true });
      setAccesses((data as Access[]) ?? []);
      setLoading(false);
    };
    load();
    const channel = supabase.channel(`browser-accesses-${agentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_accesses', filter: `agent_id=eq.${agentId}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agentId]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface }}>
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: C.surface }}>
      <style>{BA_CSS}</style>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader
          title="Logged-in browsing."
          subtitle="Let this agent use a website that needs a login, without ever handing it the password."
          note="Each access then appears as a tool the agent can call: it opens a browser that is already signed in. The password stays encrypted and is typed in only by the platform. Not supported yet: image CAPTCHAs, 'Sign in with Google/Microsoft', and codes sent by SMS or e-mail."
          actions={<HeaderButton plus onClick={() => setShowAdd(true)}>Add access</HeaderButton>}
        />

        {accesses.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: '2.2rem 1.5rem 2rem', background: '#fff' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.6rem' }}>
              <div style={{ display: 'inline-flex', marginBottom: '0.8rem' }}><IconTile icon="globe" color={C.brassDeep} size={46} /></div>
              <p style={{ fontSize: '0.98rem', fontWeight: 500, color: C.ink, margin: '0 0 0.3rem' }}>No browser accesses yet</p>
              <p style={{ fontSize: '0.82rem', color: C.soft, margin: '0 auto', maxWidth: 440, lineHeight: 1.6 }}>Add a site your agent needs to sign in to, such as a CRM, a portal or an admin panel.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', maxWidth: 820, margin: '0 auto 1.6rem' }}>
              {HOW.map((h, i) => (
                <div key={h.title} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', padding: '0.75rem 0.85rem', background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 10 }}>
                  <IconTile icon={h.icon} color={C.slate} size={30} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 500, color: C.ink, margin: 0 }}><span style={{ color: C.muted, marginRight: '0.35rem' }}>{i + 1}</span>{h.title}</p>
                    <p style={{ fontSize: '0.74rem', color: C.soft, margin: '0.15rem 0 0', lineHeight: 1.5 }}>{h.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}><HeaderButton plus onClick={() => setShowAdd(true)}>Add your first access</HeaderButton></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {accesses.map(a => (
              <AccessCard
                key={a.id} access={a} agentId={agentId} isShared={isShared}
                onUpdated={u => setAccesses(prev => prev.map(x => (x.id === u.id ? u : x)))}
                onDeleted={id => setAccesses(prev => prev.filter(x => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddModal agentId={agentId} onClose={() => setShowAdd(false)} onCreated={a => setAccesses(prev => [...prev, a])} />}
    </div>
  );
}
