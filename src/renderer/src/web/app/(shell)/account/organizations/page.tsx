// app/(shell)/account/organizations/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageLoading } from '@/components/account/ui';
import SubscribeAgentModal from './SubscribeAgentModal';
import { CreateOrgModal, EditOrgModal } from './OrgModals';
import { OrgsView } from './OrgsView';
import type { Organization, OrgAgent, OrgDraft } from './types';

type AgentRow = {
  id: string; name: string; visibility: string; org_id: string;
  agent_subscriptions: { current_period_end: string | null }[] | { current_period_end: string | null } | null;
};

export default function OrganizationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [agentsByOrg, setAgentsByOrg] = useState<Record<string, OrgAgent[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [subscribingAgent, setSubscribingAgent] = useState<OrgAgent | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }

      setUserId(session.user.id);

      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: true });

      const orgList = (data as Organization[]) ?? [];
      setOrgs(orgList);

      if (orgList.length > 0) {
        // agent_subscriptions_admin_read (RLS) lets an org owner read their own agents'
        // subscription rows -- a left-join style embed via Supabase's foreign-table
        // select, one query for every agent across every owned org.
        const { data: agentRows } = await supabase
          .from('agents')
          .select('id, name, visibility, org_id, agent_subscriptions(current_period_end)')
          .in('org_id', orgList.map(o => o.id));

        const grouped: Record<string, OrgAgent[]> = {};
        for (const row of (agentRows as AgentRow[] | null) ?? []) {
          const sub = Array.isArray(row.agent_subscriptions) ? row.agent_subscriptions[0] : row.agent_subscriptions;
          (grouped[row.org_id] ??= []).push({
            id: row.id, name: row.name, visibility: row.visibility,
            current_period_end: sub?.current_period_end ?? null,
          });
        }
        setAgentsByOrg(grouped);
      }

      setLoading(false);
    })();
  }, [router]);

  const handleOrgCreated = (org: Organization) => {
    setOrgs(prev => [...prev, org]);
    setShowModal(false);
  };

  const handleOrgSaved = (draft: OrgDraft) => {
    if (!editingOrg) return;
    setOrgs(prev => prev.map(o => o.id === editingOrg.id ? { ...o, name: draft.name, description: draft.description || null, timezone: draft.timezone } : o));
    setEditingOrg(null);
  };

  if (loading) return <PageLoading />;

  return (
    <>
      <OrgsView
        orgs={orgs} agentsByOrg={agentsByOrg} now={now}
        onCreate={() => setShowModal(true)} onEdit={setEditingOrg} onSubscribe={setSubscribingAgent}
      />

      {showModal && userId && (
        <CreateOrgModal userId={userId} onClose={() => setShowModal(false)} onCreated={handleOrgCreated} />
      )}

      {editingOrg && (
        <EditOrgModal org={editingOrg} onClose={() => setEditingOrg(null)} onSaved={handleOrgSaved} />
      )}

      {subscribingAgent && (
        <SubscribeAgentModal
          agentId={subscribingAgent.id}
          agentName={subscribingAgent.name}
          visibility={subscribingAgent.visibility}
          onClose={() => setSubscribingAgent(null)}
          onSubscribed={newPeriodEnd => {
            const agentId = subscribingAgent.id;
            setAgentsByOrg(prev => {
              const next: Record<string, OrgAgent[]> = {};
              for (const [orgId, list] of Object.entries(prev)) {
                next[orgId] = list.map(a => a.id === agentId ? { ...a, current_period_end: newPeriodEnd } : a);
              }
              return next;
            });
            setSubscribingAgent(null);
          }}
        />
      )}
    </>
  );
}
