// components/browser-access/AccessCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EnableToggles } from '@/components/EnableToggles';
import { Icon, type IconName } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { Activity } from './Activity';
import { CredentialsModal } from './Modals';
import { ManualPanel } from './ManualPanel';
import { RulesPanel } from './RulesPanel';
import { SkillsPanel } from './SkillsPanel';
import { Btn, Chip, ErrorText, IconTile, Spinner, post } from './ui';
import { STATUS_TEXT, STATUS_TONE, type Access } from './types';

// One site the agent may sign in to. Collapsed it is a single compact row: the site, its status, the one action that matters now, and the owner's switches.
// "Manage" opens four tabs (Activity, Manual, Skills, Rules) so only one section is on screen at a time. While a setup is running the card opens itself on Activity.

type TabId = 'activity' | 'manual' | 'skills' | 'rules';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'manual', label: 'Manual', icon: 'book-open' },
  { id: 'skills', label: 'Skills', icon: 'zap' },
  { id: 'rules', label: 'Rules', icon: 'shield-check' },
];

function Meta({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: '0.72rem', color: C.soft, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function AccessCard({ access, agentId, isShared, onUpdated, onDeleted }: {
  access: Access; agentId: string; isShared: boolean; onUpdated: (a: Access) => void; onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<TabId>(access.status === 'ready' && access.profile ? 'manual' : 'activity');
  const [busy, setBusy] = useState<'start' | 'test' | 'cancel' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [logKey, setLogKey] = useState(0);
  const [skillCount, setSkillCount] = useState<number | null>(null);
  const working = access.status === 'onboarding' || access.status === 'awaiting_credentials';
  const open = expanded || working;
  const activeTab: TabId = working ? 'activity' : tab;

  // The moment the assistant asks for the details the secure form opens by itself (until dismissed; a new setup re-arms it).
  const [credsDismissed, setCredsDismissed] = useState(false);
  const credsOpen = showCreds || (access.status === 'awaiting_credentials' && access.fields.length > 0 && !credsDismissed);
  const closeCreds = () => { setShowCreds(false); setCredsDismissed(true); };

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { count } = await supabase.from('browser_access_skills').select('id', { count: 'exact', head: true }).eq('access_id', access.id);
      if (!cancelled) setSkillCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [access.id, logKey]);

  const toggle = async (field: 'enabled' | 'available_to_members') => {
    setPending(true);
    const next = !access[field];
    const { error: updateError } = await createClient().from('browser_accesses').update({ [field]: next }).eq('id', access.id);
    setPending(false);
    if (!updateError) onUpdated({ ...access, [field]: next });
  };

  const run = async (action: 'start' | 'test' | 'cancel') => {
    setBusy(action);
    setError('');
    if (action === 'start') setCredsDismissed(false);
    const result = await post(`/api/agents/${agentId}/browser-access/${access.id}/${action}`);
    setBusy(null);
    if (!result.ok) { setError(result.error || 'Failed.'); return; }
    setExpanded(true);
    setTab('activity');
    setLogKey(k => k + 1);
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${access.label || access.name}"? Its saved details and the tool it provides are deleted.`)) return;
    setBusy('delete');
    const { error: deleteError } = await createClient().from('browser_accesses').delete().eq('id', access.id);
    setBusy(null);
    if (!deleteError) onDeleted(access.id);
  };

  const canTest = access.status === 'ready' || (access.status === 'failed' && access.fields.length > 0);
  const tone = STATUS_TONE[access.status];
  const tileColor = access.status === 'ready' ? C.green : access.status === 'failed' ? C.red : working ? C.brass : C.soft;

  return (
    <div className="ba-card" style={{ background: '#fff', border: `1px solid ${access.enabled ? '#CFC9B6' : C.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '0.8rem 1.05rem', display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
        <IconTile icon={working ? 'compass' : 'globe'} color={tileColor} size={38} />
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 500, color: C.ink, margin: 0 }}>{access.label || access.name}</p>
            <Chip tone={tone} dot={working}>{STATUS_TEXT[access.status]}</Chip>
          </div>
          <p style={{ fontSize: '0.74rem', color: C.muted, margin: '0.15rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {access.host} <span style={{ margin: '0 0.3rem' }}>·</span><span style={{ fontFamily: MONO, fontSize: '0.68rem' }}>browser_access_{access.name}</span>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {working ? (
            <>
              {access.status === 'awaiting_credentials' && access.fields.length > 0 && <Btn variant="primary" icon="key-round" onClick={() => setShowCreds(true)}>Enter details</Btn>}
              <Btn onClick={() => run('cancel')} disabled={busy !== null}>{busy === 'cancel' ? '…' : 'Cancel setup'}</Btn>
            </>
          ) : access.status === 'draft' || access.status === 'disabled' ? (
            <Btn variant="primary" icon="play" onClick={() => run('start')} disabled={busy !== null}>{busy === 'start' ? 'Starting…' : 'Start setup'}</Btn>
          ) : access.status === 'failed' ? (
            <>
              <Btn variant="primary" icon="rotate-cw" onClick={() => run('start')} disabled={busy !== null}>{busy === 'start' ? 'Starting…' : 'Set up again'}</Btn>
              {canTest && <Btn onClick={() => run('test')} disabled={busy !== null}>{busy === 'test' ? 'Testing…' : 'Test login'}</Btn>}
            </>
          ) : (
            <Btn icon={busy === 'test' ? undefined : 'log-in'} onClick={() => run('test')} disabled={busy !== null}>{busy === 'test' ? <><Spinner size={10} /> Testing…</> : 'Test login'}</Btn>
          )}
          <EnableToggles
            enabled={access.enabled} onToggleEnabled={() => toggle('enabled')} enabledPending={pending}
            showForUsers={isShared} forUsersEnabled={access.available_to_members} onToggleForUsers={() => toggle('available_to_members')} forUsersPending={pending}
          />
          <button
            type="button" className="ba-btn ba-outline" onClick={() => setExpanded(v => !v)} aria-expanded={open} disabled={working}
            title={open ? 'Hide details' : 'Manual, skills, rules and activity'}
          >
            Manage
            <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><Icon name="chevron-down" size={12} /></span>
          </button>
        </div>
      </div>

      {(access.status !== 'draft' || access.last_verified_at) && (
        <div style={{ padding: '0 1.05rem 0.75rem', display: 'flex', gap: '0.9rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {access.profile && <Meta><Icon name="book-open" size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />~{Math.round(access.coverage_pct ?? 0)}% explored · v{access.profile_version}</Meta>}
          {skillCount !== null && <Meta><Icon name="zap" size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />{skillCount} skill{skillCount === 1 ? '' : 's'}</Meta>}
          {access.last_verified_at && <Meta><Icon name="circle-check" size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />Login verified {new Date(access.last_verified_at).toLocaleDateString()}</Meta>}
          {access.status === 'failed' && access.last_error && <span style={{ fontSize: '0.74rem', color: C.red, minWidth: 0 }}>{access.last_error}</span>}
        </div>
      )}
      {error && <div style={{ padding: '0 1.05rem 0.75rem' }}><ErrorText>{error}</ErrorText></div>}

      {open && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, background: C.paper }}>
          <div role="tablist" aria-label="Access details" style={{ display: 'flex', gap: '0.2rem', padding: '0.55rem 0.8rem', borderBottom: `1px solid ${C.lineSoft}`, overflowX: 'auto' }}>
            {TABS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} className="ba-tab" disabled={working && t.id !== 'activity'} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={13} />{t.label}
                {t.id === 'skills' && skillCount ? <span style={{ fontFamily: MONO, fontSize: '0.64rem', opacity: 0.75 }}>{skillCount}</span> : null}
              </button>
            ))}
          </div>
          <div style={{ padding: '1rem 1.05rem 1.1rem' }}>
            {activeTab === 'activity' && <Activity accessId={access.id} refreshKey={logKey} />}
            {activeTab === 'manual' && <ManualPanel access={access} agentId={agentId} onUpdated={onUpdated} onStudyStarted={() => { setTab('activity'); setLogKey(k => k + 1); }} />}
            {activeTab === 'skills' && <SkillsPanel accessId={access.id} />}
            {activeTab === 'rules' && <RulesPanel access={access} onUpdated={onUpdated} />}
          </div>
          {!working && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.55rem 0.8rem', borderTop: `1px solid ${C.lineSoft}` }}>
              {access.fields.length > 0 && <Btn variant="ghost" icon="key-round" onClick={() => setShowCreds(true)}>Edit sign-in details</Btn>}
              {access.status !== 'draft' && access.status !== 'failed' && <Btn variant="ghost" icon="rotate-cw" onClick={() => run('start')} disabled={busy !== null}>Set up again</Btn>}
              <span style={{ marginLeft: 'auto' }}>
                <Btn variant="danger" icon="trash" onClick={remove} disabled={busy !== null}>{busy === 'delete' ? '…' : 'Remove'}</Btn>
              </span>
            </div>
          )}
        </div>
      )}

      {credsOpen && <CredentialsModal agentId={agentId} access={access} onClose={closeCreds} />}
    </div>
  );
}
