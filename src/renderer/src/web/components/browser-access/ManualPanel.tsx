// components/browser-access/ManualPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { C, MONO } from '@/components/account/tokens';
import { Btn, ErrorText, Spinner, Switch, post } from './ui';
import type { Access } from './types';

// The Manual tab: what agents read when they sign in to the site. Coverage, a reader / editor / version history, and the two background jobs
// (Study adds what is missing, Condense only makes it shorter).

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
        if (h) return <p key={i} style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: h[1].length === 1 ? '1.05rem' : '0.92rem', fontWeight: 500, color: '#514726', margin: '0.5rem 0 0' }}>{inline(h[2], i)}</p>;
        const b = t.match(/^[-*]\s+(.*)$/) || t.match(/^\d+\.\s+(.*)$/);
        if (b) return <p key={i} style={{ margin: 0, paddingLeft: '1rem', textIndent: '-0.7rem' }}>• {inline(b[1], i)}</p>;
        return <p key={i} style={{ margin: 0 }}>{inline(t, i)}</p>;
      })}
    </div>
  );
}

interface VersionRow { version: number; source: string; note: string | null; coverage_pct: number; created_at: string }

const SOURCE_LABEL: Record<string, string> = { setup: 'Setup', learned: 'Learned from a task', owner_edit: 'Edited by you', restore: 'Restored', studied: 'Studied past activity', condensed: 'Condensed' };

export function ManualPanel({ access, agentId, onUpdated, onStudyStarted }: { access: Access; agentId: string; onUpdated: (a: Access) => void; onStudyStarted: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'history'>('view');
  const [draft, setDraft] = useState('');
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [studying, setStudying] = useState(false);
  const [studyError, setStudyError] = useState('');
  const [latestRun, setLatestRun] = useState<{ kind: string; status: string; trigger: string } | null>(null);
  const pct = Math.max(0, Math.min(100, access.coverage_pct ?? 0));

  // Is a study running right now? (the latest run of this access is a study that has not finished)
  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      const { data } = await supabase.from('browser_access_runs').select('kind, status, trigger').eq('access_id', access.id).order('started_at', { ascending: false }).limit(1);
      const latest = data?.[0] as { kind: string; status: string; trigger: string } | undefined;
      setLatestRun(latest ?? null);
      setStudying(!!latest && (latest.kind === 'study' || latest.kind === 'condense') && (latest.status === 'running' || latest.status === 'queued'));
    };
    check();
    const channel = supabase.channel(`browser-access-study-${access.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_access_runs', filter: `access_id=eq.${access.id}` }, () => { check(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [access.id]);

  const startRun = async (action: 'study' | 'condense') => {
    setStudyError('');
    setStudying(true);
    const result = await post(`/api/agents/${agentId}/browser-access/${access.id}/${action}`);
    if (!result.ok) { setStudying(false); setStudyError(result.error || (action === 'study' ? 'Could not start the study.' : 'Could not start the condense.')); return; }
    onStudyStarted();
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px', maxWidth: 300 }} title={`About ${pct}% of the site is explored`}>
          <div style={{ height: 5, background: '#EDEBE2', borderRadius: 3 }}><div style={{ width: `${pct}%`, height: '100%', background: C.brass, borderRadius: 3 }} /></div>
        </div>
        <span style={{ fontSize: '0.74rem', color: C.soft }}>~{pct}% explored · version {access.profile_version}</span>
        <span style={{ fontSize: '0.72rem', color: C.muted }}>{access.last_learned_at ? `Studied ${new Date(access.last_learned_at).toLocaleDateString()}` : 'Not studied yet'}</span>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', color: C.soft, cursor: 'pointer' }} title="After tasks finish, a background study reads what happened and adds what is new.">
          <Switch on={!!access.learn_enabled} onClick={toggleLearning} label="Learn automatically after tasks" />
          Learn after tasks
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Manual view" style={{ display: 'inline-flex', gap: '0.15rem', padding: 2, background: '#F0EEE5', borderRadius: 999 }}>
          {seg('view', 'Read')}{seg('edit', 'Edit', () => setDraft(access.profile ?? ''))}{seg('history', 'History', loadVersions)}
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem' }}>
          <Btn icon={studying && latestRun?.kind !== 'condense' ? undefined : 'compass'} onClick={() => startRun('study')} disabled={studying || busy}
            title="An agent reads the history of what tasks did on this site and adds anything the manual is missing. It does not rewrite what is already right.">
            {studying && latestRun?.kind !== 'condense' ? <><Spinner size={10} /> Studying…</> : 'Study past activity'}
          </Btn>
          <Btn icon={studying && latestRun?.kind === 'condense' ? undefined : 'rotate-cw'} onClick={() => startRun('condense')} disabled={studying || busy}
            title="Makes the manual shorter without losing facts. Reads no history.">
            {studying && latestRun?.kind === 'condense' ? <><Spinner size={10} /> Condensing…</> : 'Condense'}
          </Btn>
        </span>
      </div>
      <p style={{ fontSize: '0.7rem', color: C.muted, margin: '-0.3rem 0 0' }}>Study adds what is missing; Condense only makes it shorter. Each change is saved as a version you can restore.</p>
      {studyError && <ErrorText>{studyError}</ErrorText>}

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
              <span style={{ flex: 1, minWidth: 0 }}>{v.note ? `${v.note} · ` : ''}~{v.coverage_pct}% · {new Date(v.created_at).toLocaleString()}</span>
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

