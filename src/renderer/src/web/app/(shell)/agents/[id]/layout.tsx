// app/(shell)/agents/[id]/layout.tsx
'use client';

import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSidebarMode } from '../layout';
import { AgentActivityAvatar } from '@/components/agent-header/AgentActivityAvatar';
import { useAgentActivity } from '@/components/agent-header/useAgentActivity';
import { WorkCounts } from '@/components/agent-header/WorkCounts';
import { NotificationBell } from '@/components/notifications/NotificationBell';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id:          string;
  name:        string;
  bio:         string | null;
  description: string | null;
  backstory:   string | null;
  role:        string | null;
  goal:        string | null;
  active:      boolean;
  org_id:      string;
  visibility:  'personal' | 'private' | 'public';
  is_verified: boolean;
  avatar_url:  string | null;
  billing_mode: 'owner_pays' | 'user_pays';
  handle:      string;      // the permanent public id (ag-xxxxxxxx): the agent's email address and, later, its @tag
}

type Role = 'owner' | 'member';
type NetworkStatus = 'active' | 'paused' | null;

// ─── Context ──────────────────────────────────────────────────────────────────

interface AgentLayoutCtx {
  agent:          Agent | null;
  setAgent:       (fn: (prev: Agent | null) => Agent | null) => void;
  chatId:         string | null;
  agentId:        string;
  role:           Role | null;
  networkStatus:  NetworkStatus;
  orgName:        string;
  /** Re-check which owner tabs exist (Email, WhatsApp) right now. Called by Platform Tools after a switch, so a tab appears or goes without navigating. */
  refreshTabs:    () => void;
}

export const AgentCtx = createContext<AgentLayoutCtx>({
  agent: null, setAgent: () => {}, chatId: null, agentId: '', role: null, networkStatus: null, orgName: '', refreshTabs: () => {},
});
export const useAgentCtx = () => useContext(AgentCtx);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <>
      <div style={{ width: 18, height: 18, border: '1.5px solid #DAD5C5', borderTopColor: '#26251E', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// Profile is deliberately pulled out and appended last, below, rather than
// living inline in either tab list — it needs to end up after every
// conditionally-shown member tab too (My Keys/Database Integrations/
// Instructions), not just after a fixed base list.
const PROFILE_TAB = { key: 'settings', label: 'Agent Profile', segment: 'settings' };
// Workspace — a per-(agent, viewer) file browser (project folders, then the
// files inside one), sitting directly above Profile in both tab strips so
// it's the last thing before the owner/member's own account-level settings.
// Same auth shape as the download/upload routes it reuses (owner or active
// connected member; each viewer only ever sees their OWN sub-workspace —
// agent_workspace_projects/agent_workspace_index have zero RLS policies, so
// this is a server-side route, not a direct browser query like Watch Tower).
const WORKSPACE_TAB = { key: 'workspace', label: 'Workspace', segment: 'workspace' };

// Runsheet (renamed 2026-09-17 from "Crons" — same underlying `crons` table
// and route, purely a display rename; see bemain/crons.py's module
// docstring) leads every tab strip: it's the always-current record of what
// the agent is doing in the background, the thing worth seeing first.
const OWNER_TABS = [
  { key: 'crons',          label: 'Runsheet',       segment: 'crons' },
  { key: 'platform-tools', label: 'Platform Tools', segment: 'platform-tools' },
  { key: 'email',          label: 'Emails',         segment: 'email' },           // only while the send_email platform tool is on (see hasEmail)
  { key: 'whatsapp',       label: 'WhatsApp',       segment: 'whatsapp' },        // only while a WhatsApp platform tool is on (see hasWhatsapp)
  { key: 'tools',          label: 'Tool Builder',   segment: 'tools' },
  { key: 'instructions',   label: 'Instructions',   segment: 'instructions' },
  { key: 'secrets',        label: 'Secrets',        segment: 'secrets' },
  { key: 'signed-apis',    label: 'Database Integrations',    segment: 'signed-apis' },
  { key: 'mcp',            label: 'MCP',            segment: 'mcp' },
  { key: 'browser-access', label: 'Browser Access', segment: 'browser-access' },
  { key: 'network',        label: 'Add Users',      segment: 'network' },
  WORKSPACE_TAB,
  PROFILE_TAB,
];

// A connected member gets the same tab-strip pattern as an owner, just a
// thinner, read-only set — the same routes (settings/tools/crons) branch
// their own content by role rather than needing separate member-only pages.
const MEMBER_TABS_BASE = [
  { key: 'crons',      label: 'Runsheet',     segment: 'crons' },
  { key: 'tools',      label: 'Tools',        segment: 'tools' },
];
const MEMBER_KEYS_TAB = { key: 'keys', label: 'My Keys', segment: 'keys' };
// Reuses the owner's own /instructions route (branches its content by role,
// same pattern as /settings and /tools) — gated on hasSharedInstructions so
// it doesn't show up as an empty tab when the owner hasn't shared anything.
const MEMBER_INSTRUCTIONS_TAB = { key: 'instructions', label: 'Instructions', segment: 'instructions' };
// Connectors (Gmail / Outlook) are UNWIRED from the tab strips (2026-10-22), the way Watch Tower is: the connectors/ page, its API routes and the
// bemain connector tier are all still there and an already-connected account keeps working in chat; there is just no tab to reach it from.
// To bring it back, restore the owner tab, the member tab (shown when agent_connectors has a row for the agent) and the summary-panel row.
// Same "own tab, not folded into anything else" reasoning as Connectors —
// enabling a signed-API integration (capability) and connecting your own
// credentials for it (a config value with its own lifecycle, per user) are
// different enough decisions to blur together in either existing list.
const MEMBER_SIGNED_APIS_TAB = { key: 'signed-apis', label: 'Database Integrations', segment: 'signed-apis' };

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const params   = useParams();
  const pathname = usePathname();
  const agentId  = params.id as string;

  const [loading,       setLoading]       = useState(true);
  const [agent,         setAgentState]    = useState<Agent | null>(null);
  const [chatId,        setChatId]        = useState<string | null>(null);
  const [working,       setWorking]       = useState(false);
  const [role,          setRole]          = useState<Role | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(null);
  const [orgName,       setOrgName]       = useState('');
  const [hasKeyDefs,    setHasKeyDefs]    = useState(false);
  const [hasSignedApis, setHasSignedApis] = useState(false);
  const [hasEmail,      setHasEmail]      = useState(false);
  const [hasWhatsapp,   setHasWhatsapp]   = useState(false);
  const [tabsVersion,   setTabsVersion]   = useState(0);
  const [hasSharedInstructions, setHasSharedInstructions] = useState(false);

  const setAgent = (fn: (prev: Agent | null) => Agent | null) => {
    setAgentState(prev => fn(prev));
  };

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }

      const { data: agentData } = await supabase
        .from('agents')
        .select('id, name, bio, description, backstory, role, goal, active, org_id, visibility, is_verified, avatar_url, billing_mode, handle')
        .eq('id', agentId)
        .single();

      if (!agentData) { router.replace('/agents'); return; }
      setAgentState(agentData as Agent);

      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, owner_id')
        .eq('id', agentData.org_id)
        .maybeSingle();

      const isOwner = !!org && org.owner_id === session.user.id;
      setOrgName(org?.name ?? '');

      if (isOwner) {
        setRole('owner');
      } else {
        const { data: network } = await supabase
          .from('agent_network')
          .select('status')
          .eq('agent_id', agentId)
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (!network) { router.replace('/agents'); return; }
        setRole('member');
        setNetworkStatus(network.status as NetworkStatus);

        const { count } = await supabase
          .from('agent_user_secret_defs')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agentId);
        setHasKeyDefs((count ?? 0) > 0);

        const { count: signedApiCount } = await supabase
          .from('agent_signed_apis')
          .select('provider_key', { count: 'exact', head: true })
          .eq('agent_id', agentId);
        setHasSignedApis((signedApiCount ?? 0) > 0);

        // RLS (instructions_member_read) already filters to enabled AND
        // available_to_members rows, so this count directly answers "is
        // there anything to show" with no client-side filtering needed.
        const { count: instructionsCount } = await supabase
          .from('instructions')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', agentId);
        setHasSharedInstructions((instructionsCount ?? 0) > 0);
      }

      const { data: existingChat } = await supabase
        .from('chats')
        .select('id')
        .eq('agent_id', agentId)
        .eq('created_by', session.user.id)
        .maybeSingle();

      if (existingChat) {
        setChatId(existingChat.id);
      } else {
        const { data: newChat } = await supabase
          .from('chats')
          .insert({ agent_id: agentId, org_id: agentData.org_id, created_by: session.user.id })
          .select('id')
          .single();
        if (newChat) setChatId(newChat.id);
      }

      setLoading(false);
    })();
  }, [agentId]);

  useEffect(() => {
    if (!chatId) return;

    const supabase = createClient();
    let cancelled = false;

    // "working" means exactly one thing: the assistant is running a turn for
    // this chat right now. bemain holds chats.orchestrator_status = 'running'
    // for the whole life of a turn (including draining any messages queued
    // meanwhile) and releases it in every exit path — so it is the one honest
    // signal. It deliberately does NOT look at message statuses (a message can
    // sit 'queued' or 'processing' without a run happening) and is untouched by
    // task runs, which never take this lock.
    const applyStatus = (status: string | null | undefined) => {
      if (!cancelled) setWorking(status === 'running');
    };

    const channel = supabase
      .channel(`agent-status:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` },
        (payload) => applyStatus((payload.new as { orchestrator_status?: string }).orchestrator_status),
      )
      .subscribe();

    const syncStatus = async () => {
      const { data } = await supabase
        .from('chats')
        .select('orchestrator_status')
        .eq('id', chatId)
        .maybeSingle();
      applyStatus(data?.orchestrator_status);
    };
    syncStatus();

    // Realtime can miss an event while the tab is asleep — re-sync on return.
    const onVisible = () => { if (document.visibilityState === 'visible') syncStatus(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  // What the assistant is doing right now (thinking / using a tool), shown on the avatar while a turn runs.
  const activity = useAgentActivity(chatId, working);

  // The Email tab exists only while the send_email platform tool is on. Re-checked on every navigation inside the agent, so switching the tool on in
  // Platform Tools shows the tab straight away (one small query per navigation).
  useEffect(() => {
    if (role !== 'owner') return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient().from('agent_platform_tools').select('enabled').eq('agent_id', agentId).eq('tool_key', 'send_email').maybeSingle();
      if (!cancelled) setHasEmail(!!data?.enabled);
    })();
    return () => { cancelled = true; };
  }, [role, agentId, pathname, tabsVersion]);

  // The WhatsApp tab exists while any of the three WhatsApp platform tools is on, AND while a number is still linked even if the tools were switched off: the owner must be able to
  // unlink it (which deletes what is stored) rather than have the tab vanish with the link still attached.
  useEffect(() => {
    if (role !== 'owner') return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [tools, link] = await Promise.all([
        supabase.from('agent_platform_tools').select('enabled').eq('agent_id', agentId).in('tool_key', ['whatsapp_chats', 'whatsapp_read', 'whatsapp_send']).eq('enabled', true).limit(1),
        supabase.from('wa_connection_status').select('phone_number').eq('agent_id', agentId).maybeSingle(),
      ]);
      if (!cancelled) setHasWhatsapp((tools.data?.length ?? 0) > 0 || !!link.data?.phone_number);
    })();
    return () => { cancelled = true; };
  }, [role, agentId, pathname, tabsVersion]);

  const inConfigMode = role !== null && pathname !== `/agents/${agentId}`;
  const isPrivate = agent?.visibility === 'private';
  // People connected to a private agent get no Tools or Instructions tabs: the agent's inner workings stay with its owner.
  const memberTabs = useMemo(() => [
    ...MEMBER_TABS_BASE.filter(t => !isPrivate || t.key !== 'tools'),
    ...(hasSharedInstructions && !isPrivate ? [MEMBER_INSTRUCTIONS_TAB] : []),
    ...(hasKeyDefs ? [MEMBER_KEYS_TAB] : []),
    ...(hasSignedApis ? [MEMBER_SIGNED_APIS_TAB] : []),
    WORKSPACE_TAB,
    PROFILE_TAB,
  ], [isPrivate, hasSharedInstructions, hasKeyDefs, hasSignedApis]);
  // Add Users is only meaningful for private agents (invites); personal agents aren't shared and public ones add people via the Marketplace.
  // Memoized: the effect below depends on `tabs`, so a fresh array each render would re-run it forever.
  const ownerTabs = useMemo(() => OWNER_TABS.filter(t => (t.key !== 'network' || isPrivate) && (t.key !== 'email' || (role === 'owner' && hasEmail)) && (t.key !== 'whatsapp' || (role === 'owner' && hasWhatsapp))), [isPrivate, hasEmail, hasWhatsapp, role]);
  const tabs = role === 'owner' ? ownerTabs : memberTabs;
  const activeTab = tabs.find(t => pathname.endsWith(`/${t.segment}`))?.key;

  // Tell the parent (chat) layout to swap its left column from the contact
  // list into this agent's own vertical tab list while a config tab is
  // open — cleared on leaving config mode or unmounting (switching agents,
  // navigating away entirely), so the contact list never gets stuck hidden.
  const { setConfigView } = useSidebarMode();
  useEffect(() => {
    if (inConfigMode && agent) {
      setConfigView({
        agentId, agentName: agent.name, avatarUrl: agent.avatar_url,
        tabs, activeKey: activeTab,
      });
    } else {
      setConfigView(null);
    }
    return () => setConfigView(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inConfigMode, agentId, agent?.name, agent?.avatar_url, tabs, activeTab]);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner />
    </div>
  );

  return (
    <AgentCtx.Provider value={{ agent, setAgent, chatId, agentId, role, networkStatus, orgName, refreshTabs: () => setTabsVersion(v => v + 1) }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header
          onClick={() => { if (!inConfigMode) router.push(`/agents/${agentId}/${tabs[0].segment}`); }}
          style={{
            height: 60, borderBottom: '1px solid #E2DFD3', background: '#F7F6F2',
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.25rem',
            flexShrink: 0, cursor: !inConfigMode ? 'pointer' : 'default',
          }}
        >
          {/* Avatar + name/bio only render here on the chat view. In config
              mode this same identity is already shown once, immediately to
              the left, by ConfigSidebar (app/(shell)/agents/layout.tsx) —
              repeating it here duplicated the agent's name across both the
              left tab list and this window's own header (found 2026-09-17).
              The active tab's own label stands in instead, giving this
              window a heading without re-stating who it belongs to. */}
          {inConfigMode ? (
            <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: 0, flex: 1, minWidth: 0 }}>
              {tabs.find(t => t.key === activeTab)?.label ?? ''}
            </p>
          ) : (
            <>
              {agent && <AgentActivityAvatar name={agent.name} avatarUrl={agent.avatar_url} size={38} activity={activity} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {agent?.name}
                </p>
                {agent?.bio && (
                  <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.bio}
                  </p>
                )}
              </div>
            </>
          )}

          {agent && !agent.active && (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.62rem', padding: '0.15rem 0.45rem', borderRadius: 3, background: '#F5E6E1', color: '#B34A3C', border: '1px solid #E3C4BB' }}>
              disabled by admin
            </span>
          )}
          {/* Connected is the normal state and lives on the Agent Profile; the header only speaks up when access is paused. */}
          {role === 'member' && networkStatus === 'paused' && (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.62rem', padding: '0.15rem 0.45rem', borderRadius: 3, background: '#F5E6E1', color: '#B34A3C', border: '1px solid #E3C4BB' }}>
              access paused
            </span>
          )}

          {/* Active tasks / shifts / projects (running and scheduled), chat view only. */}
          {!inConfigMode && role !== null && <WorkCounts key={`wc-${agentId}`} agentId={agentId} />}

          {/* Notifications: where this agent's recurring tasks post their results (the chat
              stays for conversation). Chat view only -- the config tabs have their own header. */}
          {!inConfigMode && role !== null && (
            <NotificationBell key={agentId} agentId={agentId} agentName={agent?.name ?? 'this agent'} />
          )}

        </header>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {children}
        </div>

      </div>
    </AgentCtx.Provider>
  );
}
