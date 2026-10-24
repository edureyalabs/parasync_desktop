// src/renderer/src/views/account/OrganizationsPage.tsx
import { Chip } from '@/components/ui';
import { Empty, Loaded, Panel, Row, TabPage, WebNote, shortDate } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { planLine } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

interface Org { id: string; name: string; description: string | null; slug: string; created_at: string; timezone: string | null }
interface OrgAgent { id: string; name: string; visibility: string; org_id: string; active: boolean; agent_subscriptions: { current_period_end: string | null } | { current_period_end: string | null }[] | null }

const VIS: Record<string, string> = { personal: 'Personal', private: 'Private', public: 'Public' };

function periodEnd(a: OrgAgent): string | null {
  const s = a.agent_subscriptions;
  return (Array.isArray(s) ? s[0]?.current_period_end : s?.current_period_end) ?? null;
}

export function OrganizationsPage() {
  const { session } = useAuth();
  const { openAgent, openAgentTab } = useNav();
  const uid = session?.user.id;
  const state = useAsync<{ orgs: Org[]; agents: OrgAgent[] }>(async () => {
    if (!uid) throw new Error('You are signed out.');
    const { data: orgs, error } = await supabase.from('organizations').select('id, name, description, slug, created_at, timezone').eq('owner_id', uid).order('created_at', { ascending: true });
    if (error) throw new Error('Your organizations could not be loaded.');
    const list = (orgs ?? []) as Org[];
    if (list.length === 0) return { orgs: list, agents: [] };
    const { data: agents } = await supabase.from('agents').select('id, name, visibility, org_id, active, agent_subscriptions(current_period_end)').in('org_id', list.map((o) => o.id)).order('name', { ascending: true });
    return { orgs: list, agents: (agents ?? []) as unknown as OrgAgent[] };
  }, [uid]);

  return (
    <TabPage title="Organizations" subtitle="The organizations you own and the agents inside them. An agent belongs to its organization.">
      <Loaded state={state}>
        {({ orgs, agents }) => orgs.length === 0 ? (
          <Panel><Empty>You do not own an organization yet. Create one in the web app to build agents. Agents you are connected to appear under My Agents.</Empty></Panel>
        ) : (
          <>
            {orgs.map((o) => {
              const mine = agents.filter((a) => a.org_id === o.id);
              return (
                <Panel key={o.id} title={o.name} subtitle={[o.description, o.timezone ? `Time zone ${o.timezone}` : '', `Created ${shortDate(o.created_at)}`].filter(Boolean).join(' · ')}>
                  {mine.length === 0 ? <Empty>No agents in this organization yet.</Empty> : mine.map((a, i) => {
                    const plan = planLine(periodEnd(a), a.visibility);
                    return (
                      <Row
                        key={a.id} last={i === mine.length - 1} primary={a.name} secondary={VIS[a.visibility] ?? a.visibility}
                        onClick={() => { openAgent(a.id); openAgentTab('profile'); }}
                        right={<>{!a.active && <Chip label="Off" />}<Chip label={plan.text} tone={plan.tone} /></>}
                      />
                    );
                  })}
                </Panel>
              );
            })}
            <p style={{ margin: 0, fontSize: 12.5, color: C.soft }}>Select an agent to open its profile and settings.</p>
          </>
        )}
      </Loaded>
      <WebNote path="/account/organizations">Creating organizations and agents, editing them and paying for an agent's plan are done in the web app.</WebNote>
    </TabPage>
  );
}
