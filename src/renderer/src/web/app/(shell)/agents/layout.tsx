// app/(shell)/agents/layout.tsx
'use client';

import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AgentAvatar } from '@/components/AgentAvatar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Org {
  id:   string;
  name: string;
}

type Visibility = 'personal' | 'private' | 'public';

interface AgentRow {
  id:             string;
  name:           string;
  description:    string | null;
  active:         boolean;
  visibility:     Visibility;
  avatarUrl:      string | null;
  isOwner:        boolean;
  networkStatus?: 'active' | 'paused';
}

interface AgentListCtx {
  refreshAgents: () => void;
}

const AgentListContext = createContext<AgentListCtx>({ refreshAgents: () => {} });
export const useAgentListCtx = () => useContext(AgentListContext);

// ─── Sidebar mode ─────────────────────────────────────────────────────────────
// Lets the per-agent layout (a child of this one) tell this layout to swap
// the left column from the normal contact list into a vertical list of that
// agent's own config tabs while it's in config mode — set on entering config
// mode, cleared on leaving it or unmounting.

interface ConfigTab {
  key:     string;
  label:   string;
  segment: string;
}

interface SidebarConfigState {
  agentId:    string;
  agentName:  string;
  avatarUrl:  string | null;
  tabs:       ConfigTab[];
  activeKey:  string | undefined;
}

interface SidebarModeCtx {
  setConfigView: (state: SidebarConfigState | null) => void;
}

const SidebarModeContext = createContext<SidebarModeCtx>({ setConfigView: () => {} });
export const useSidebarMode = () => useContext(SidebarModeContext);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ size = 16, color = '#26251E' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{
        width: size, height: size,
        border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`,
        borderTopColor: color, borderRadius: '50%',
        animation: 'spin 0.8s linear infinite', flexShrink: 0,
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

const MAX_AGENTS_PER_ORG = 5;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;
const BIO_MAX = 160;

// Two-card choice, shown FIRST (before any other field) — see AgentTypeStep
// below. Chosen once and locked forever after (DB-enforced — see
// 20260813000000_lock_agent_visibility.sql). `public` is left out of this
// flow entirely for now — no verification queue exists yet (see CLAUDE.md's
// "No verification queue UI exists yet" note), so it's not offered as a
// choice at all here rather than shown disabled.
const AGENT_TYPE_OPTIONS: { value: Visibility; title: string; tag: string; description: string }[] = [
  {
    value: 'personal',
    title: 'Personal',
    tag: 'Self usage',
    description: 'For personal use — solopreneurs, dedicated research, your own day-to-day work. A single user: just you.',
  },
  {
    value: 'private',
    title: 'Private Agents — Teams',
    tag: 'Recommended for companies',
    description: 'Built for organizations, agencies, and groups — deployable with multi-user access and a shared brain across your team.',
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

// ─── Step 1: agent type ────────────────────────────────────────────────────────

function AgentTypeStep({ onClose, onSelect }: {
  onClose:  () => void;
  onSelect: (visibility: Visibility) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', animation: 'fadeIn 0.15s ease both',
      }}
    >
      <div style={{
        background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8,
        padding: '2rem', width: '100%', maxWidth: 560,
        animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              New agent
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
              What kind of agent is this?
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {AGENT_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              style={{
                display: 'flex', flexDirection: 'column', gap: '0.35rem', textAlign: 'left',
                padding: '1rem 1.1rem', borderRadius: 8, border: '1px solid #DAD5C5',
                background: '#fff', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#26251E'; (e.currentTarget as HTMLButtonElement).style.background = '#F7F6F2'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#DAD5C5'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <p style={{ fontSize: '0.92rem', fontWeight: 500, color: '#26251E', margin: 0 }}>{opt.title}</p>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', padding: '0.15rem 0.45rem', borderRadius: 3, background: '#EFE4C9', color: '#A17F3A', border: '1px solid #E4D2A0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {opt.tag}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.55 }}>
                {opt.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Create Agent Modal ───────────────────────────────────────────────

function CreateAgentModal({ orgs, visibility, userId, onClose, onBack, onCreated }: {
  orgs:       Org[];
  visibility: Visibility;
  userId:     string;
  onClose:    () => void;
  onBack:     () => void;
  onCreated:  (agent: AgentRow) => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const needsNewOrg = orgs.length === 0;

  useEffect(() => {
    nameRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedOrgName = newOrgName.trim();
    if (needsNewOrg && !trimmedOrgName) { setError('Organization name is required.'); return; }
    if (needsNewOrg && trimmedOrgName.length < 2) { setError('Organization name must be at least 2 characters.'); return; }
    if (!needsNewOrg && !orgId) { setError('Choose an organization.'); return; }
    if (!trimmedName) { setError('Agent name is required.'); return; }
    if (trimmedName.length < 2) { setError('Name must be at least 2 characters.'); return; }

    setLoading(true);
    setError('');

    const supabase = createClient();
    let effectiveOrgId = orgId;

    if (needsNewOrg) {
      const slug = slugify(trimmedOrgName);
      if (!slug) { setError('Organization name must contain at least one letter or number.'); setLoading(false); return; }

      const { data: existing } = await supabase.from('organizations').select('id').eq('slug', slug).maybeSingle();
      if (existing) { setError('An organization with a similar name already exists.'); setLoading(false); return; }

      const { data: newOrg, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: trimmedOrgName, description: newOrgDescription.trim() || null, owner_id: userId, slug })
        .select('id')
        .single();

      if (orgError || !newOrg) {
        setError(orgError?.code === '23505' ? 'An organization with this name already exists.' : 'Could not create the organization. Please try again.');
        setLoading(false);
        return;
      }
      effectiveOrgId = newOrg.id;
    }

    const { count } = await supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', effectiveOrgId);

    if ((count ?? 0) >= MAX_AGENTS_PER_ORG) {
      setError(`This organization already has ${MAX_AGENTS_PER_ORG} agents — the limit on the free plan.`);
      setLoading(false);
      return;
    }

    const { data, error: dbError } = await supabase
      .from('agents')
      .insert({
        name: trimmedName,
        description: description.trim() || null,
        bio: bio.trim() || null,
        visibility,
        org_id: effectiveOrgId,
      })
      .select()
      .single();

    setLoading(false);

    if (dbError || !data) { setError('Something went wrong. Please try again.'); return; }

    onCreated({
      id: data.id, name: data.name, description: data.description, active: data.active,
      visibility: data.visibility, avatarUrl: null, isOwner: true,
    });
  };

  const typeLabel = visibility === 'personal' ? 'Personal' : 'Private Agents — Teams';

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', animation: 'fadeIn 0.15s ease both',
      }}
    >
      <div style={{
        background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8,
        padding: '2rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
        animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <button
              onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: 0, marginBottom: '0.5rem', fontSize: '0.72rem', fontFamily: "'Inter', sans-serif" }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M6.5 1L2 5.5l4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back
            </button>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              New agent · {typeLabel}
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
              Create an agent
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {needsNewOrg ? (
            <>
              <div style={{ background: '#F7F6F2', border: '1px solid #E2DFD3', borderRadius: 6, padding: '0.9rem 1rem' }}>
                <p style={{ fontSize: '0.78rem', color: '#67655A', margin: '0 0 0.85rem', lineHeight: 1.55 }}>
                  You don&apos;t have an organization yet — agents live inside one, so let&apos;s create your first.
                </p>
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  Organization name <span style={{ color: '#B34A3C' }}>*</span>
                </label>
                <input
                  className="agent-input" type="text" placeholder="e.g. Acme Corp"
                  value={newOrgName} onChange={e => { setNewOrgName(e.target.value); setError(''); }}
                  maxLength={60} style={{ marginBottom: '0.75rem' }}
                />
                <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  Organization description{' '}
                  <span style={{ color: '#67655A', fontFamily: "'Inter', sans-serif", textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>optional</span>
                </label>
                <textarea
                  className="agent-input" placeholder="What does this organization do?"
                  value={newOrgDescription} onChange={e => setNewOrgDescription(e.target.value)}
                  maxLength={200} rows={2} style={{ resize: 'none', lineHeight: 1.6 }}
                />
              </div>
            </>
          ) : (
            <div>
              <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                Organization <span style={{ color: '#B34A3C' }}>*</span>
              </label>
              <select className="agent-input" value={orgId} onChange={e => { setOrgId(e.target.value); setError(''); }}>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Name <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <input
              ref={nameRef} className="agent-input" type="text" placeholder="e.g. Support Agent"
              value={name} onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} maxLength={NAME_MAX}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Bio{' '}
              <span style={{ color: '#67655A', fontFamily: "'Inter', sans-serif", textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>optional</span>
            </label>
            <input
              className="agent-input" type="text" placeholder="A short line shown wherever this agent is seen"
              value={bio} onChange={e => setBio(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} maxLength={BIO_MAX}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
              {bio.length}/{BIO_MAX}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Description{' '}
              <span style={{ color: '#67655A', fontFamily: "'Inter', sans-serif", textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>optional</span>
            </label>
            <textarea
              className="agent-input" placeholder="What does this agent do?"
              value={description} onChange={e => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX} rows={3} style={{ resize: 'none', lineHeight: 1.6 }}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
              {description.length}/{DESCRIPTION_MAX}
            </p>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            style={{
              background: '#26251E', color: '#F7F6F2', border: 'none',
              padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif",
              cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem',
              opacity: !name.trim() ? 0.5 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading && <Spinner size={14} color="#fff" />}
            {loading ? 'Creating…' : 'Create agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post-create notice ────────────────────────────────────────────────────────
// Deliberately NOT a toast that auto-dismisses — the user must click the close
// icon, matching the explicit "clean walkaway" requirement: an agent that's
// just been created still needs two more real steps (enable it, buy it a
// subscription) before it can actually be used, and a self-dismissing toast
// risks that getting missed.

function PostCreateNotice({ agentId, agentName, onClose }: {
  agentId:   string;
  agentName: string;
  onClose:   () => void;
}) {
  return (
    <div style={{
      position: 'fixed', top: 76, right: 24, zIndex: 45, width: '100%', maxWidth: 360,
      background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '1.1rem 1.25rem',
      animation: 'slideUp 0.2s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: 0 }}>
          &ldquo;{agentName}&rdquo; created
        </p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '0.75rem', flexShrink: 0 }} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#67655A', margin: '0 0 0.75rem', lineHeight: 1.55 }}>
        Two things left before it can be used:
      </p>
      <ol style={{ margin: '0 0 0.9rem', paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#3A3830', lineHeight: 1.7 }}>
        <li>
          Enable it from its{' '}
          <Link href={`/agents/${agentId}/settings`} style={{ color: '#26251E', fontWeight: 500, textDecoration: 'underline' }}>Agent Profile tab</Link>
          {' '}— agents start off, not active.
        </li>
        <li>
          Give it a subscription from{' '}
          <Link href="/account/organizations" style={{ color: '#26251E', fontWeight: 500, textDecoration: 'underline' }}>Organizations</Link>
          , and make sure the{' '}
          <Link href="/account/billing" style={{ color: '#26251E', fontWeight: 500, textDecoration: 'underline' }}>wallet balance</Link>
          {' '}is above zero.
        </li>
      </ol>
    </div>
  );
}

// ─── Contact row ──────────────────────────────────────────────────────────────

function AgentContactRow({ agent, active }: { agent: AgentRow; active: boolean }) {
  const router = useRouter();
  const statusLabel = agent.isOwner
    ? (agent.active ? 'active' : 'inactive')
    : agent.networkStatus === 'paused' ? 'paused' : 'connected';
  const statusColor = agent.isOwner
    ? (agent.active ? '#3C7E6A' : '#9E9C8F')
    : agent.networkStatus === 'paused' ? '#B34A3C' : '#67655A';

  return (
    <div
      onClick={() => router.push(`/agents/${agent.id}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.65rem 0.9rem', cursor: 'pointer',
        background: active ? '#EFE4C9' : 'transparent',
        borderBottom: '1px solid #EDEBE2',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = '#EDEBE2'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={38} ring ringColor={active ? '#26251E' : '#A17F3A'} ringGap={active ? '#EFE4C9' : '#fff'} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '0.86rem', fontWeight: 500, color: '#26251E', margin: 0, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.name}
        </p>
        <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.65rem', color: '#9E9C8F', margin: '2px 0 0', textTransform: 'lowercase' }}>
          {agent.visibility}
        </p>
      </div>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} title={statusLabel} />
    </div>
  );
}

// ─── Config sidebar (replaces the contact list while a per-agent config tab is open) ──

function ConfigSidebar({ config }: { config: SidebarConfigState }) {
  const router = useRouter();
  return (
    <>
      <div style={{ padding: '1rem 1rem 0.85rem', borderBottom: '1px solid #EDEBE2' }}>
        <button
          onClick={() => router.push(`/agents/${config.agentId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: 0, marginBottom: '0.85rem', fontSize: '0.78rem', fontFamily: "'Inter', sans-serif" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 1.5L3 6l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to chat
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <AgentAvatar name={config.agentName} avatarUrl={config.avatarUrl} size={32} ring ringGap="#fff" />
          <p style={{ fontSize: '0.92rem', fontWeight: 500, color: '#26251E', margin: 0, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {config.agentName}
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
        {config.tabs.map(t => (
          <Link key={t.key} href={`/agents/${config.agentId}/${t.segment}`} style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '0.6rem 1.25rem', fontSize: '0.85rem',
                color: config.activeKey === t.key ? '#26251E' : '#67655A',
                background: config.activeKey === t.key ? '#EFE4C9' : 'transparent',
                fontWeight: config.activeKey === t.key ? 500 : 400,
                borderLeft: config.activeKey === t.key ? '3px solid #26251E' : '3px solid transparent',
              }}
            >
              {t.label}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AgentsShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const selectedId = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  // Two-step creation flow: 'closed' -> '+' opens step 1 ('type') -> a
  // selection opens step 2 ('details', with selectedVisibility already set).
  const [modalStep, setModalStep] = useState<'closed' | 'type' | 'details'>('closed');
  const [selectedVisibility, setSelectedVisibility] = useState<Visibility>('personal');
  const [postCreateNotice, setPostCreateNotice] = useState<{ agentId: string; agentName: string } | null>(null);
  const [configView, setConfigView] = useState<SidebarConfigState | null>(null);

  const load = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/auth'); return; }
    setUserId(session.user.id);

    const { data: myOrgs } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: true });

    const orgList = (myOrgs as Org[]) ?? [];
    setOrgs(orgList);

    const orgIds = orgList.map(o => o.id);
    const owned: AgentRow[] = [];
    if (orgIds.length > 0) {
      const { data: ownedAgents } = await supabase
        .from('agents')
        .select('id, name, description, active, visibility, org_id, avatar_url')
        .in('org_id', orgIds)
        .order('name', { ascending: true });
      for (const a of ownedAgents ?? []) {
        owned.push({
          id: a.id, name: a.name, description: a.description, active: a.active,
          visibility: a.visibility, avatarUrl: a.avatar_url, isOwner: true,
        });
      }
    }

    interface NetworkRow {
      status: 'active' | 'paused';
      agent: {
        id: string; name: string; description: string | null; active: boolean;
        visibility: 'personal' | 'private' | 'public'; avatar_url: string | null;
      } | null;
    }

    const { data: network } = await supabase
      .from('agent_network')
      .select('status, agent:agents(id, name, description, active, visibility, avatar_url)')
      .eq('user_id', session.user.id)
      .returns<NetworkRow[]>();

    const connected: AgentRow[] = ((network ?? []) as NetworkRow[])
      .filter((row): row is NetworkRow & { agent: NonNullable<NetworkRow['agent']> } => row.agent !== null)
      .map(row => ({
        id: row.agent.id, name: row.agent.name, description: row.agent.description,
        active: row.agent.active, visibility: row.agent.visibility, avatarUrl: row.agent.avatar_url,
        isOwner: false, networkStatus: row.status,
      }))
      .sort((a, b) => (a.visibility === b.visibility ? a.name.localeCompare(b.name) : a.visibility === 'private' ? -1 : 1));

    setAgents([...owned, ...connected]);
    setLoading(false);
  };

  useEffect(() => {
    (async () => { await load(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AgentListContext.Provider value={{ refreshAgents: load }}>
    <SidebarModeContext.Provider value={{ setConfigView }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', height: '100%' }}>
        <style>{`
          .agent-input {
            width: 100%; padding: 0.6rem 0.75rem; font-size: 0.875rem;
            font-family: 'Inter', sans-serif; color: #26251E; background: #F7F6F2;
            border: 1px solid #DAD5C5; border-radius: 4px; outline: none;
            transition: border-color 0.15s; box-sizing: border-box;
          }
          .agent-input:focus { border-color: #26251E; }
          .agent-input::placeholder { color: #9E9C8F; }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {/* Left column — the contact list, or (while a config tab is open
            for the selected agent) that agent's vertical tab list instead */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #E2DFD3', display: 'flex', flexDirection: 'column', background: '#fff' }}>
          {configView ? (
            <ConfigSidebar config={configView} />
          ) : (
            <>
              {/* Same height and rule as the chat header beside it, so the list starts level with the chat. */}
              <div style={{ height: 60, boxSizing: 'border-box', padding: '0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2DFD3', flexShrink: 0 }}>
                <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0, color: '#514726' }}>My Agents</h1>
                <button
                  onClick={() => setModalStep('type')}
                  title="New agent"
                  style={{ height: 26, padding: '0 0.65rem 0 0.55rem', gap: '0.35rem', borderRadius: 6, border: 'none', background: '#26251E', color: '#F7F6F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: "'Inter',sans-serif", fontSize: '0.72rem', fontWeight: 500, whiteSpace: 'nowrap' }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  New agent
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Spinner /></div>
                ) : agents.length === 0 ? (
                  <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.82rem', color: '#9E9C8F', margin: 0, lineHeight: 1.6 }}>
                      No agents yet. Create one, or browse the Marketplace to connect to one.
                    </p>
                  </div>
                ) : (
                  agents.map(a => <AgentContactRow key={a.id} agent={a} active={a.id === selectedId} />)
                )}
              </div>
            </>
          )}
        </div>

        {/* Right pane */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          {children}
        </div>
      </div>

      {modalStep === 'type' && (
        <AgentTypeStep
          onClose={() => setModalStep('closed')}
          onSelect={v => { setSelectedVisibility(v); setModalStep('details'); }}
        />
      )}

      {modalStep === 'details' && userId && (
        <CreateAgentModal
          orgs={orgs}
          visibility={selectedVisibility}
          userId={userId}
          onClose={() => setModalStep('closed')}
          onBack={() => setModalStep('type')}
          onCreated={async agent => {
            setModalStep('closed');
            await load(); // picks up a newly-created org too, not just the agent
            setPostCreateNotice({ agentId: agent.id, agentName: agent.name });
            router.push(`/agents/${agent.id}`);
          }}
        />
      )}

      {postCreateNotice && (
        <PostCreateNotice
          agentId={postCreateNotice.agentId}
          agentName={postCreateNotice.agentName}
          onClose={() => setPostCreateNotice(null)}
        />
      )}
    </SidebarModeContext.Provider>
    </AgentListContext.Provider>
  );
}
