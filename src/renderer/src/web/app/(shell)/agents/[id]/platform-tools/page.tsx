// app/agents/[id]/platform-tools/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { EnableToggles } from '@/components/EnableToggles';
import { TabHeader } from '@/components/agent-ui/TabHeader';
import { Icon } from '@/components/icons/Icon';
import { toolIcon } from '@/components/icons/toolIcons';

type DataType = 'string' | 'number' | 'boolean' | 'json';

interface ToolVariable {
  name:      string;
  data_type: DataType;
  context:   string;
  required:  boolean;
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Platform tools ───────────────────────────────────────────────────────────
// Toggleable first-party tools (code_executor, browser automation, email, WhatsApp): off by default per agent, toggled here. The catalog comes from
// bemain's registry (via /api/platform-tools), never hardcoded here, so a new toggleable tool shows up automatically once shipped (as a plain row with an
// "Other" badge until it is given a group below). Document generation tools (create_excel/read_word_document/etc.) are inbuilt (always on) and not in this
// catalog, see platform_tools/__init__.py's module docstring in bemain.
//
// One list, one row per tool, each with its picture and a category badge (Computer use, Messaging), instead of a heading per category. Split out from the
// Tools tab (2026-08-22) so "things Parasync built" and "things this org built" aren't blended: Tool Builder (the tools/ route) is custom Python only.

interface PlatformToolCatalogEntry {
  key:         string;
  name:        string;
  description: string;
  context:     string;
  variables:   ToolVariable[];
}

// Bundles multiple tool_keys that have no independent meaning to an admin (e.g. "open a browser session" is useless without "run a script in it") into one
// visible row with one combined enable/members switch. Both underlying keys still toggle together as one action: this is a display grouping over the same
// agent_platform_tools rows, not a schema change. A catalog entry not covered by any group here still renders as its own row, so a brand-new toggleable
// tool needs zero frontend change to show up; only multi-key bundling, a nicer name or a category needs an entry.
interface ToolGroup {
  label:       string;
  /** badge on the row, and the filter it appears under */
  category:    string;
  /** the tool whose picture the row uses */
  iconKey:     string;
  /** falls back to the catalog description of the first key */
  description?: string;
  keys:        string[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'Code Execution', category: 'Computer use', iconKey: 'code_executor',
    description: 'Real, unrestricted Python — calculations, data processing, API calls, web requests, and full library control for advanced Excel/Word/PDF generation beyond what the built-in document tools cover.',
    keys: ['code_executor'],
  },
  {
    label: 'Browser Automation', category: 'Computer use', iconKey: 'browser_execute',
    description: 'A real, persistent headless browser this agent can drive with Playwright scripts — navigate JS-rendered sites, fill and submit forms, scrape content, take screenshots. It can also look at any page (controls, forms, tables, dialogs, the requests the page makes) and make one move at a time, seeing what each move caused. Session state (cookies, logins, open tabs) persists across calls.',
    keys: ['browser_open_session', 'browser_execute', 'browser_look', 'browser_act', 'browser_close_session'],
  },
  {
    label: 'Email', category: 'Messaging', iconKey: 'send_email',
    keys: ['send_email'],
  },
  // WhatsApp is three tools (list chats, read, send) shown as one row. For Users starts OFF for these (a database trigger on agent_platform_tools), so
  // connected users cannot reach the owner's WhatsApp until the owner switches it on here.
  {
    label: 'WhatsApp', category: 'Messaging', iconKey: 'whatsapp_send',
    description: "Read and send WhatsApp messages through the number you link on the WhatsApp tab. You choose which groups and contacts the agent may read and which it may send to; nothing else is reachable. Messages are stored for 30 days so the agent can summarize or act on them. Turn this on, then open the WhatsApp tab to link a number.",
    keys: ['whatsapp_chats', 'whatsapp_read', 'whatsapp_send'],
  },
];

const CATEGORY_TONE: Record<string, { fg: string; bg: string; line: string }> = {
  'Computer use': { fg: '#3D5A6E', bg: '#E8EEF2', line: '#BFCCD6' },
  Messaging: { fg: '#7C5F27', bg: '#F6EBCB', line: '#E4D2A0' },
};
const OTHER_TONE = { fg: '#67655A', bg: '#EDEBE2', line: '#DAD5C5' };

function CategoryBadge({ category }: { category: string }) {
  const t = CATEGORY_TONE[category] ?? OTHER_TONE;
  return (
    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: t.fg, background: t.bg, border: `1px solid ${t.line}`, borderRadius: 999, padding: '0.12rem 0.5rem', whiteSpace: 'nowrap' }}>
      {category}
    </span>
  );
}

function ToolTile({ iconKey }: { iconKey: string }) {
  const spec = toolIcon(iconKey);
  return (
    <span aria-hidden="true" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center', color: spec.color, background: `${spec.color}14`, border: `1px solid ${spec.color}30` }}>
      <Icon name={spec.name} size={20} />
    </span>
  );
}

function ToolRow({
  group, enabledKeys, memberKeys, isShared, pending, onToggle, onToggleMembers,
}: {
  group: ToolGroup;
  enabledKeys: Set<string>;
  memberKeys: Set<string>;
  isShared: boolean;
  pending: boolean;
  onToggle: () => void;
  onToggleMembers: () => void;
}) {
  const enabled = group.keys.every(k => enabledKeys.has(k));
  const availableToMembers = group.keys.every(k => memberKeys.has(k));

  return (
    <div style={{ background: '#fff', border: `1px solid ${enabled ? '#CFC9B6' : '#E2DFD3'}`, borderRadius: 10, padding: '0.9rem 1.15rem', display: 'flex', alignItems: 'center', gap: '0.95rem' }}>
      <ToolTile iconKey={group.iconKey} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', margin: '0 0 0.25rem' }}>
          <p style={{ fontSize: '0.92rem', fontWeight: 500, color: '#26251E', margin: 0 }}>{group.label}</p>
          <CategoryBadge category={group.category} />
        </div>
        <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>{group.description}</p>
      </div>
      <EnableToggles
        enabled={enabled}
        onToggleEnabled={onToggle}
        enabledPending={pending}
        showForUsers={isShared}
        forUsersEnabled={availableToMembers}
        onToggleForUsers={onToggleMembers}
        forUsersPending={pending}
      />
    </div>
  );
}

// Keys whose switch adds or removes an owner tab, and what to tell the owner when it is switched on (the tab appears at once, without leaving this page).
const EMAIL_KEYS = ['send_email'];
const WHATSAPP_KEYS = ['whatsapp_chats', 'whatsapp_read', 'whatsapp_send'];

function PlatformToolsList({ agentId, isShared, refreshTabs }: { agentId: string; isShared: boolean; refreshTabs: () => void }) {
  const [catalog, setCatalog] = useState<PlatformToolCatalogEntry[]>([]);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [memberKeys, setMemberKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [announce, setAnnounce] = useState<{ text: string; href: string; label: string } | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [offPrompt, setOffPrompt] = useState<{ phone: string; working: boolean; error: string } | null>(null);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const [catalogRes, stateRes] = await Promise.all([
        fetch('/api/platform-tools').then(r => r.json()).catch(() => ({ tools: [], error: 'Network error.' })),
        supabase.from('agent_platform_tools').select('tool_key, enabled, available_to_members').eq('agent_id', agentId),
      ]);

      if (catalogRes.error) setLoadError(catalogRes.error);
      setCatalog((catalogRes.tools as PlatformToolCatalogEntry[]) ?? []);
      const rows: { tool_key: string; enabled: boolean; available_to_members: boolean }[] = stateRes.data ?? [];
      setEnabledKeys(new Set(rows.filter(r => r.enabled).map(r => r.tool_key)));
      // Default true — a row that only exists because `enabled` was toggled
      // pre-2026-08-08 has no available_to_members value of its own to read
      // yet other than the column's DB default (true).
      setMemberKeys(new Set(rows.filter(r => r.available_to_members !== false).map(r => r.tool_key)));
      setLoading(false);
    })();
  }, [agentId]);

  const setKeysEnabled = async (keys: string[], nextEnabled: boolean) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('agent_platform_tools')
      .upsert(keys.map(key => ({ agent_id: agentId, tool_key: key, enabled: nextEnabled })), { onConflict: 'agent_id,tool_key' });
    if (error) return;
    setEnabledKeys(prev => {
      const next = new Set(prev);
      for (const key of keys) { if (nextEnabled) next.add(key); else next.delete(key); }
      return next;
    });
    // A first switch-on creates the row, and the database decides the "For Users" starting value (off for WhatsApp, on for the rest): show what it really is.
    const { data: rows } = await supabase.from('agent_platform_tools').select('tool_key, available_to_members').eq('agent_id', agentId).in('tool_key', keys);
    if (rows) {
      setMemberKeys(prev => {
        const next = new Set(prev);
        for (const r of rows as { tool_key: string; available_to_members: boolean }[]) { if (r.available_to_members !== false) next.add(r.tool_key); else next.delete(r.tool_key); }
        return next;
      });
    }
    // Tell the layout to re-check its tabs now, and tell the owner where the new tab is.
    refreshTabs();
    if (nextEnabled && keys.some(k => EMAIL_KEYS.includes(k))) {
      setAnnounce({ text: 'Email is on. Its tab has been added.', href: `/agents/${agentId}/email`, label: 'Open the Email tab' });
    } else if (nextEnabled && keys.some(k => WHATSAPP_KEYS.includes(k))) {
      setAnnounce({ text: 'WhatsApp is on. Its tab has been added: link a number there and choose the chats.', href: `/agents/${agentId}/whatsapp`, label: 'Open the WhatsApp tab' });
    } else {
      setAnnounce(null);
    }
  };

  // Switching WhatsApp off while a number is still linked: ask first, because turning the tools off pauses the number but leaves it linked, while Unlink also deletes what is stored.
  const switchOffWhatsApp = async (keys: string[]) => {
    const { data } = await createClient().from('wa_connection_status').select('phone_number').eq('agent_id', agentId).maybeSingle();
    if (data?.phone_number) { setOffPrompt({ phone: data.phone_number as string, working: false, error: '' }); return; }
    await setKeysEnabled(keys, false);
  };

  const confirmOff = async (unlink: boolean) => {
    if (!offPrompt) return;
    setOffPrompt({ ...offPrompt, working: true, error: '' });
    if (unlink) {
      try {
        const res = await fetch(`/api/agents/${agentId}/whatsapp/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
        const body = await res.json().catch(() => ({ ok: false }));
        if (!res.ok || !body.ok) { setOffPrompt({ phone: offPrompt.phone, working: false, error: body.error || 'Could not unlink the number. Try again.' }); return; }
      } catch {
        setOffPrompt({ phone: offPrompt.phone, working: false, error: 'Could not reach the server. Try again.' });
        return;
      }
    }
    await setKeysEnabled(WHATSAPP_KEYS.filter(k => catalog.some(t => t.key === k)), false);
    setOffPrompt(null);
  };

  const setKeysMemberAccess = async (keys: string[], nextAvailable: boolean) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('agent_platform_tools')
      .upsert(keys.map(key => ({ agent_id: agentId, tool_key: key, available_to_members: nextAvailable })), { onConflict: 'agent_id,tool_key' });
    if (!error) {
      setMemberKeys(prev => {
        const next = new Set(prev);
        for (const key of keys) { if (nextAvailable) next.add(key); else next.delete(key); }
        return next;
      });
    }
  };

  // The rows: the groups whose tools exist in the live catalog (resilient to a rename/removal on the bemain side), then every other catalog entry as its own row.
  const catalogByKey = new Map(catalog.map(t => [t.key, t]));
  const rows: ToolGroup[] = [
    ...TOOL_GROUPS
      .map(g => ({ ...g, keys: g.keys.filter(k => catalogByKey.has(k)) }))
      .filter(g => g.keys.length > 0)
      .map(g => ({ ...g, description: g.description ?? catalogByKey.get(g.keys[0])?.description ?? '' })),
    ...catalog
      .filter(t => !TOOL_GROUPS.some(g => g.keys.includes(t.key)))
      .map(t => ({ label: t.name, category: 'Other', iconKey: t.key, description: t.description, keys: [t.key] })),
  ];
  const categories = Array.from(new Set(rows.map(r => r.category)));
  const shown = filter === 'All' ? rows : rows.filter(r => r.category === filter);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner size={20} color="#26251E" />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader title="Built into Parasync." subtitle="First-party tools. Off by default; turn on the ones this agent should have." note={<>Every agent also has built-in workspace and document-generation tools automatically (always on, not shown here).</>} />

        {loadError && <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0 0 1rem' }}>{loadError}</p>}

        {announce && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', background: '#E5F0E7', border: '1px solid #8DBA9A', borderRadius: 6, padding: '0.6rem 0.9rem', margin: '0 0 1rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#26251E' }}>{announce.text}</span>
            <Link href={announce.href} style={{ fontSize: '0.8rem', color: '#3D7A4F', fontWeight: 500 }}>{announce.label} →</Link>
            <button type="button" onClick={() => setAnnounce(null)} aria-label="Dismiss" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#67655A', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
          </div>
        )}

        {offPrompt && (
          <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: '#fff', borderRadius: 10, maxWidth: 460, width: '100%', padding: '1.3rem 1.4rem', border: '1px solid #E2DFD3' }}>
              <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.66rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9E9C8F', margin: '0 0 0.4rem' }}>A number is still linked</p>
              <p style={{ fontSize: '1rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.6rem' }}>Turn WhatsApp off for +{offPrompt.phone}?</p>
              <p style={{ fontSize: '0.82rem', color: '#67655A', lineHeight: 1.6, margin: '0 0 1rem' }}>
                <strong>Unlink and turn off</strong> removes the device from the phone and deletes everything stored for the number: chats, messages, files and sent history.{' '}
                <strong>Turn off, keep linked</strong> only pauses it: nothing is read or sent, the number stays linked, and the WhatsApp tab stays so you can unlink later.
              </p>
              {offPrompt.error && <p style={{ fontSize: '0.78rem', color: '#B34A3C', margin: '0 0 0.8rem' }}>{offPrompt.error}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" disabled={offPrompt.working} onClick={() => setOffPrompt(null)} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', borderRadius: 6, border: '1px solid #DAD5C5', background: 'transparent', color: '#3A3830', cursor: 'pointer' }}>Cancel</button>
                <button type="button" disabled={offPrompt.working} onClick={() => confirmOff(false)} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', borderRadius: 6, border: '1px solid #DAD5C5', background: '#fff', color: '#26251E', cursor: 'pointer' }}>Turn off, keep linked</button>
                <button type="button" disabled={offPrompt.working} onClick={() => confirmOff(true)} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', borderRadius: 6, border: '1px solid transparent', background: '#26251E', color: '#F7F6F2', cursor: 'pointer' }}>{offPrompt.working ? 'Working…' : 'Unlink and turn off'}</button>
              </div>
            </div>
          </div>
        )}

        {catalog.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No platform tools available right now.</p>
          </div>
        ) : (
          <>
            {categories.length > 1 && (
              <div role="group" aria-label="Filter tools" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0 0 0.9rem' }}>
                {['All', ...categories].map(c => (
                  <button
                    key={c} type="button" onClick={() => setFilter(c)} aria-pressed={filter === c}
                    style={{ border: `1px solid ${filter === c ? '#26251E' : '#DAD5C5'}`, background: filter === c ? '#26251E' : 'transparent', color: filter === c ? '#F7F6F2' : '#3A3830', borderRadius: 999, padding: '0.25rem 0.8rem', fontSize: '0.74rem', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
                  >{c}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {shown.map(group => (
                <ToolRow
                  key={group.label}
                  group={group}
                  enabledKeys={enabledKeys}
                  memberKeys={memberKeys}
                  isShared={isShared}
                  pending={pendingGroup === group.label}
                  onToggle={async () => {
                    const nextEnabled = !group.keys.every(k => enabledKeys.has(k));
                    setPendingGroup(group.label);
                    if (!nextEnabled && group.keys.some(k => WHATSAPP_KEYS.includes(k))) await switchOffWhatsApp(group.keys);
                    else await setKeysEnabled(group.keys, nextEnabled);
                    setPendingGroup(null);
                  }}
                  onToggleMembers={async () => {
                    const nextAvailable = !group.keys.every(k => memberKeys.has(k));
                    setPendingGroup(group.label);
                    await setKeysMemberAccess(group.keys, nextAvailable);
                    setPendingGroup(null);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlatformToolsPage() {
  const { agentId, agent, refreshTabs } = useAgentCtx();
  // Per-tool member-access toggle only means anything once this agent can be
  // shared at all — hidden entirely for personal agents, same gating every
  // other tool tier's "Members" switch already uses.
  const isShared = !!agent?.visibility && agent.visibility !== 'personal';
  return <PlatformToolsList agentId={agentId} isShared={isShared} refreshTabs={refreshTabs} />;
}
