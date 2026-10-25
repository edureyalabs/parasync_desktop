// components/browser-access/ManualPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { C, MONO } from '@/components/account/tokens';
import { Btn, ErrorText, Spinner, Switch, post } from './ui';
import type { Access } from './types';

// The Guide tab: what agents read when they sign in to the site, laid out like a book (chapters for the main areas, sections inside them). A reader / editor /
// version history, and the one switch that controls learning: "Keep learning from tasks". With it on, a background agent updates the guide after a task that used
// the site has settled, and every step of that work shows in the Runsheet. There are no buttons to start it by hand.

// A small, safe Markdown view (headings, bullets, bold, code) so the profile reads as a document, not a dump.
function inline(text: string, key: number): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span key={key}>
      {parts.map((p, i) => p.startsWith('`') ? <code key={i} style={{ fontFamily: MONO, fontSize: '0.92em', background: '#F3F1E8', padding: '0 0.25rem', borderRadius: 3 }}>{p.slice(1, -1)}</code>
        : p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p)}
    </span>
  );
}

function ProfileView({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: C.ink, lineHeight: 1.6 }}>
      {text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 4 }} />;
        const h = t.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
          const level = h[1].length;
          return <p key={i} style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: level <= 2 ? '1.05rem' : level === 3 ? '0.95rem' : '0.88rem', fontWeight: level <= 2 ? 600 : 500, color: '#514726', margin: level <= 2 ? '0.9rem 0 0' : '0.5rem 0 0', paddingLeft: level > 2 ? `${(level - 2) * 0.8}rem` : 0 }}>{inline(h[2], i)}</p>;
        }
        const quote = t.match(/^>\s+(.*)$/);
        if (quote) return <p key={i} style={{ margin: 0, color: C.soft, fontStyle: 'italic' }}>{inline(quote[1], i)}</p>;
        const b = t.match(/^[-*]\s+(.*)$/) || t.match(/^\d+\.\s+(.*)$/);
        if (b) return <p key={i} style={{ margin: 0, paddingLeft: '1rem', textIndent: '-0.7rem' }}>• {inline(b[1], i)}</p>;
        return <p key={i} style={{ margin: 0 }}>{inline(t, i)}</p>;
      })}
    </div>
  );
}

interface VersionRow { version: number; source: string; note: string | null; coverage_pct: number; created_at: string }

const SOURCE_LABEL: Record<string, string> = { setup: 'Setup', learned: 'Learned from a task', owner_edit: 'Edited by you', restore: 'Restored', studied: 'Learned from a task', condensed: 'Condensed' };

export function ManualPanel({ access, agentId, onUpdated }: { access: Access; agentId: string; onUpdated: (a: Access) => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'history'>('view');
  const [draft, setDraft] = useState('');
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [learning, setLearning] = useState(false);
  const chapters = (access.profile ?? '').split('\n').filter(l => /^##\s+\S/.test(l)).length;

  // Is a learning run working right now? (shown as a small note; the work itself is in the Runsheet)
  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      const { data } = await supabase.from('browser_access_runs').select('kind, status').eq('access_id', access.id).eq('kind', 'learn').in('status', ['running', 'queued']).limit(1);
      setLearning(!!data?.length);
    };
    const first = setTimeout(check, 0);
    const channel = supabase.channel(`browser-access-learning-${access.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_access_runs', filter: `access_id=eq.${access.id}` }, () => { check(); })
      .subscribe();
    return () => { clearTimeout(first); supabase.removeChannel(channel); };
  }, [access.id]);

  const loadVersions = async () => {
    const { data } = await createClient().from('browser_access_profile_versions')
      .select('version, source, note, coverage_pct, created_at').eq('access_id', access.id).order('version', { ascending: false }).limit(30);
    setVersions((data as VersionRow[]) ?? []);
  };

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    const result = await post(`/api/agents/${agentId}/browser-access/${access.id}/profile`, body);
    setBusy(false);
    if (!result.ok) { setError(result.error || 'Could not save.'); return false; }
    return true;
  };

  const toggleLearning = async () => {
    const next = !access.learn_enabled;
    const { error: updateError } = await createClient().from('browser_accesses').update({ learn_enabled: next }).eq('id', access.id);
    if (!updateError) onUpdated({ ...access, learn_enabled: next });
  };

  const seg = (key: typeof mode, label: string, onOpen?: () => void) => (
    <button type="button" role="tab" aria-selected={mode === key} className="ba-tab" onClick={() => { setMode(key); setError(''); onOpen?.(); }}>{label}</button>
  );

  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: '0.7rem 0.9rem' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 500, color: C.ink, margin: 0 }}>Keep learning from tasks</p>
          <p style={{ fontSize: '0.72rem', color: C.soft, margin: '0.15rem 0 0', lineHeight: 1.55 }}>
            {access.learn_enabled
              ? 'On. After a task that used this site settles, an agent reads what it found out and updates the guide. Watch it work in the Runsheet.'
              : 'Off. Nothing updates this guide by itself; you can still edit it below.'}
          </p>
        </div>
        {learning && <span style={{ fontSize: '0.72rem', color: C.brassDeep, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Spinner size={10} /> Learning now</span>}
        <Switch on={!!access.learn_enabled} onClick={toggleLearning} label="Keep learning from tasks" />
      </div>
      <p style={{ fontSize: '0.72rem', color: C.muted, margin: 0 }}>
        {chapters} chapter{chapters === 1 ? '' : 's'} · version {access.profile_version}{access.last_learned_at ? ` · last learned ${new Date(access.last_learned_at).toLocaleDateString()}` : ' · nothing learned yet'}. Each change is saved as a version you can restore.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Guide view" style={{ display: 'inline-flex', gap: '0.15rem', padding: 2, background: '#F0EEE5', borderRadius: 999 }}>
          {seg('view', 'Read')}{seg('edit', 'Edit', () => setDraft(access.profile ?? ''))}{seg('history', 'History', loadVersions)}
        </div>
      </div>

      {mode === 'view' && (access.profile ? (
        <div style={{ background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: '0.9rem 1.1rem', maxHeight: 380, overflowY: 'auto' }}>
          <ProfileView text={access.profile} />
        </div>
      ) : (
        <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0 }}>No manual yet. It is written at the end of a successful setup, and grows as tasks use the site.</p>
      ))}

      {mode === 'edit' && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <textarea className="ba-field" value={draft} onChange={e => setDraft(e.target.value)} rows={14} style={{ fontFamily: MONO, fontSize: '0.74rem', lineHeight: 1.55, resize: 'vertical' }} />
          <p style={{ fontSize: '0.7rem', color: C.muted, margin: 0 }}>Markdown: an overview first, then one <code>## Section</code> per topic. Never put passwords, keys or personal data in it. At most 20,000 characters.</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Btn variant="primary" disabled={busy || !draft.trim()} onClick={async () => { if (await send({ action: 'edit', content: draft })) setMode('view'); }}>{busy ? 'Saving…' : 'Save as a new version'}</Btn>
            <Btn onClick={() => setMode('view')}>Cancel</Btn>
          </div>
        </div>
      )}

      {mode === 'history' && (
        <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, overflow: 'hidden' }}>
          {versions.length === 0 && <p style={{ fontSize: '0.76rem', color: C.soft, margin: 0, padding: '0.7rem 0.9rem' }}>No history yet.</p>}
          {versions.map((v, i) => (
            <div key={v.version} className="ba-row" style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', padding: '0.45rem 0.8rem', borderTop: i ? `1px solid ${C.lineSoft}` : 'none', fontSize: '0.74rem', color: C.soft }}>
              <span style={{ fontFamily: MONO, minWidth: 28, color: C.ink }}>v{v.version}</span>
              <span style={{ minWidth: 120, color: C.ink }}>{SOURCE_LABEL[v.source] ?? v.source}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{v.note ? `${v.note} · ` : ''}{new Date(v.created_at).toLocaleString()}</span>
              {v.version === access.profile_version ? <span style={{ fontSize: '0.68rem', color: C.green }}>current</span> : (
                <Btn disabled={busy} onClick={async () => {
                  if (!window.confirm(`Restore version ${v.version}? The current manual stays in the history.`)) return;
                  if (await send({ action: 'restore', version: v.version })) { setMode('view'); }
                }}>Restore</Btn>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

