// components/browser-access/ToolsPanel.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { C, MONO } from '@/components/account/tokens';
import { Btn, Chip, ErrorText, IconTile, Spinner, post } from './ui';
import type { Access, LinkedToolRow, ProposalStatus, Run, ToolProposal } from './types';

// The Tools tab: tools for this site that agents can call directly (the platform logs in for them). "Find tools" starts the tool researcher, which reads what
// agents did here and the tools that already exist, and suggests tools. You tick the ones you want, add remarks if you like, and Build:
// a builder agent writes each one, tests it on the live site and switches it on only when the test passed. Nothing is built without your approval.

const PROPOSAL_COLUMNS = 'id, name, title, summary, runs_in, inputs, returns, changes_data, evidence, approach, sample_inputs, hint, status, remarks, tool_name, verification, error, created_at';
const TOOL_COLUMNS = 'id, name, description, enabled, runs_in, verified_at, fail_count, last_error, usage_count';
const OPEN_FOR_APPROVAL: ProposalStatus[] = ['proposed', 'failed'];
const IN_PROGRESS: ProposalStatus[] = ['approved', 'building'];

const RUNS_IN_TEXT = { page: 'Runs in the page', http: "Calls the site's API" } as const;
const small: React.CSSProperties = { fontSize: '0.72rem', color: C.soft, margin: 0, lineHeight: 1.55 };

function Section({ title, count, children, hint }: { title: string; count?: number; children: React.ReactNode; hint?: string }) {
  return (
    <section style={{ display: 'grid', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '0.78rem', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '0.01em' }}>{title}</h3>
        {count !== undefined && <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted }}>{count}</span>}
        {hint && <span style={{ ...small, marginLeft: 'auto' }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function ProposalCard({ proposal, selected, remarks, open, disabled, onSelect, onRemarks, onToggleOpen }: {
  proposal: ToolProposal; selected: boolean; remarks: string; open: boolean; disabled: boolean;
  onSelect: () => void; onRemarks: (text: string) => void; onToggleOpen: () => void;
}) {
  const selectable = OPEN_FOR_APPROVAL.includes(proposal.status);
  const building = IN_PROGRESS.includes(proposal.status);
  return (
    <div style={{ background: '#fff', border: `1px solid ${selected ? C.brass : C.line}`, boxShadow: selected ? '0 0 0 3px rgba(161,127,58,0.12)' : 'none', borderRadius: 10, padding: '0.7rem 0.85rem', display: 'grid', gap: '0.45rem', transition: 'border-color 0.15s, box-shadow 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        {selectable ? (
          <input
            type="checkbox" checked={selected} onChange={onSelect} disabled={disabled} aria-label={`Select ${proposal.title}`}
            style={{ width: 16, height: 16, accentColor: C.ink, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
          />
        ) : (
          <IconTile icon={proposal.status === 'built' ? 'circle-check' : 'wrench'} color={proposal.status === 'built' ? C.green : C.brassDeep} size={22} />
        )}
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink }}>{proposal.title}</span>
            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: C.muted }}>{proposal.name}</span>
          </div>
        </div>
        <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip tone="slate">{RUNS_IN_TEXT[proposal.runs_in]}</Chip>
          {proposal.changes_data && <Chip tone="amber" title="This tool creates, edits or submits something on the site, not just reads.">Changes data</Chip>}
          {proposal.evidence.length > 0 && <Chip>{`from ${proposal.evidence.length} task${proposal.evidence.length === 1 ? '' : 's'}`}</Chip>}
          {building && <Chip tone="brass" dot>{proposal.status === 'building' ? 'Building' : 'Queued'}</Chip>}
          {proposal.status === 'built' && <Chip tone="green">Built and tested</Chip>}
          {proposal.status === 'failed' && <Chip tone="red">Could not build</Chip>}
        </div>
        <Btn icon={open ? 'chevron-down' : 'chevron-right'} onClick={onToggleOpen}>{open ? 'Hide' : 'Details'}</Btn>
      </div>

      <p style={{ fontSize: '0.78rem', color: C.body, margin: 0, lineHeight: 1.55 }}>{proposal.summary}</p>
      {proposal.status === 'failed' && proposal.error && <ErrorText>{proposal.error}</ErrorText>}
      {proposal.status === 'built' && proposal.verification && <p style={{ ...small, color: C.green }}>{proposal.verification.split('\n')[0]}</p>}
      {proposal.remarks && !selected && proposal.status !== 'proposed' && <p style={small}><b>Your remarks:</b> {proposal.remarks}</p>}

      {open && (
        <div style={{ display: 'grid', gap: '0.45rem', borderTop: `1px solid ${C.lineSoft}`, paddingTop: '0.55rem' }}>
          {proposal.inputs.length > 0 ? (
            <p style={small}><b>Takes:</b> {proposal.inputs.map(i => `${i.name}${i.data_type ? ` (${i.data_type})` : ''}${i.required === false ? ' optional' : ''}${i.context ? ` — ${i.context}` : ''}`).join('; ')}</p>
          ) : <p style={small}><b>Takes:</b> nothing.</p>}
          {proposal.returns && <p style={small}><b>Returns:</b> {proposal.returns}</p>}
          {proposal.approach && <p style={small}><b>How it would work:</b> {proposal.approach}</p>}
          {proposal.sample_inputs && <p style={small}><b>Test with:</b> <span style={{ fontFamily: MONO, fontSize: '0.68rem' }}>{JSON.stringify(proposal.sample_inputs)}</span></p>}
          {proposal.evidence.length > 0 && (
            <div style={{ display: 'grid', gap: '0.15rem' }}>
              <p style={small}><b>Seen in:</b></p>
              {proposal.evidence.map(e => <p key={e.task_id} style={{ ...small, paddingLeft: '0.6rem' }}>· {e.definition || `task ${e.number}`}</p>)}
            </div>
          )}
          {proposal.hint && <p style={small}><b>Asked for:</b> {proposal.hint}</p>}
        </div>
      )}

      {selected && (
        <div style={{ display: 'grid', gap: '0.25rem' }}>
          <label style={{ ...small, fontWeight: 500, color: C.body }} htmlFor={`remarks-${proposal.id}`}>Remarks for the builder (optional)</label>
          <textarea
            id={`remarks-${proposal.id}`} className="ba-field" rows={2} value={remarks} maxLength={2000} disabled={disabled}
            placeholder="Anything it should do differently: a name, an input, a limit, what to leave out…"
            onChange={e => onRemarks(e.target.value)} style={{ resize: 'vertical' }}
          />
        </div>
      )}
    </div>
  );
}

export function ToolsPanel({ access, agentId, onChanged }: {
  access: Access; agentId: string; onChanged: () => void;
}) {
  const [proposals, setProposals] = useState<ToolProposal[]>([]);
  const [tools, setTools] = useState<LinkedToolRow[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hint, setHint] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'find' | 'build' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [p, t, r] = await Promise.all([
      supabase.from('tool_proposals').select(PROPOSAL_COLUMNS).eq('access_id', access.id).order('created_at', { ascending: false }).limit(60),
      supabase.from('agent_created_tools').select(TOOL_COLUMNS).eq('access_id', access.id).order('name', { ascending: true }),
      supabase.from('browser_access_runs').select('id, kind, status, error, started_at, trigger, attempts, next_attempt_at').eq('access_id', access.id).in('kind', ['research', 'build']).order('started_at', { ascending: false }).limit(1),
    ]);
    setProposals((p.data as ToolProposal[]) ?? []);
    setTools((t.data as LinkedToolRow[]) ?? []);
    setRun((r.data?.[0] as Run | undefined) ?? null);
    setLoaded(true);
  }, [access.id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const supabase = createClient();
    const channel = supabase.channel(`browser-access-tools-${access.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tool_proposals', filter: `access_id=eq.${access.id}` }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_created_tools', filter: `access_id=eq.${access.id}` }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_access_runs', filter: `access_id=eq.${access.id}` }, () => { load(); })
      .subscribe();
    return () => { clearTimeout(first); supabase.removeChannel(channel); };
  }, [access.id, load]);

  const live = run?.status === 'running' || run?.status === 'queued';
  // A safety net while something runs: the live channel can miss an event if the connection blinks.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [live, load]);

  const review = useMemo(() => proposals.filter(p => OPEN_FOR_APPROVAL.includes(p.status)), [proposals]);
  const working = useMemo(() => proposals.filter(p => IN_PROGRESS.includes(p.status)), [proposals]);
  const built = useMemo(() => proposals.filter(p => p.status === 'built'), [proposals]);
  const rejected = useMemo(() => proposals.filter(p => p.status === 'rejected'), [proposals]);
  const chosen = review.filter(p => selected[p.id]);
  const locked = busy !== null || !!live;

  const find = async () => {
    setBusy('find');
    setError('');
    const result = await post(`/api/agents/${agentId}/browser-access/${access.id}/tools/research`, { hint: hint.trim() });
    setBusy(null);
    if (!result.ok) { setError(result.error || 'Could not start the search.'); return; }
    setHint('');
    onChanged();
    load();
  };

  const act = async (kind: 'build' | 'reject') => {
    setBusy(kind);
    setError('');
    const selections = chosen.map(p => ({ id: p.id, remarks: (remarks[p.id] ?? '').trim() }));
    const result = await post(`/api/agents/${agentId}/browser-access/${access.id}/tools/${kind}`, { selections });
    setBusy(null);
    if (!result.ok) { setError(result.error || 'That did not work.'); return; }
    setSelected({});
    onChanged();
    load();
  };

  const toggleAll = () => {
    const all = chosen.length === review.length;
    setSelected(all ? {} : Object.fromEntries(review.map(p => [p.id, true])));
  };

  if (!loaded) return <p style={{ fontSize: '0.76rem', color: C.muted, margin: 0 }}>Loading…</p>;

  const runWord = run?.kind === 'build' ? 'Building the tools you approved' : 'Looking through what agents did here';

  return (
    <div style={{ display: 'grid', gap: '1.1rem' }}>
      <p style={{ ...small, fontSize: '0.74rem' }}>
        A tool is a saved, tested script for a job agents keep doing on this site. An agent calls it directly: the platform signs in, runs it and closes the browser, so a task needs no login or logout step.
        Nothing is built until you approve it, and you can delete or switch off any tool afterwards.
      </p>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '0.8rem 0.9rem', display: 'grid', gap: '0.55rem' }}>
        <label htmlFor={`tool-hint-${access.id}`} style={{ fontSize: '0.78rem', fontWeight: 500, color: C.ink }}>
          Looking for something specific? <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          id={`tool-hint-${access.id}`} className="ba-field" rows={2} value={hint} maxLength={1500} disabled={locked}
          placeholder="For example: a tool that exports yesterday's outward challans as a table"
          onChange={e => setHint(e.target.value)} style={{ resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
          <Btn variant="primary" size="md" icon={busy === 'find' ? undefined : 'search'} onClick={find} disabled={locked || access.status !== 'ready'}>
            {busy === 'find' ? <><Spinner size={11} color="#F7F6F2" /> Starting…</> : 'Find tools'}
          </Btn>
          <span style={small}>It reads past tasks and existing tools, then suggests tools. With a request typed, yours comes first.</span>
        </div>
      </div>

      {live && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: C.brassWash, border: `1px solid ${C.brassLine}`, borderRadius: 10, padding: '0.55rem 0.8rem', flexWrap: 'wrap' }}>
          <Spinner size={12} color={C.brassDeep} />
          <span style={{ fontSize: '0.78rem', color: C.ink }}>{runWord}…</span>
          <Link href={`/agents/${agentId}/crons`} style={{ marginLeft: 'auto', fontSize: '0.74rem', color: C.brassDeep, textDecoration: 'underline' }}>Follow it in the Runsheet</Link>
        </div>
      )}
      {!live && run?.status === 'failed' && run.error && run.error !== 'cancelled' && <ErrorText>The last {run.kind === 'build' ? 'build' : 'search'} did not finish: {run.error}</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}

      {review.length > 0 && (
        <Section title="Suggestions" count={review.length} hint="Tick the ones you want built.">
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {review.map(p => (
              <ProposalCard
                key={p.id} proposal={p} selected={!!selected[p.id]} remarks={remarks[p.id] ?? ''} open={openId === p.id} disabled={locked}
                onSelect={() => setSelected(s => ({ ...s, [p.id]: !s[p.id] }))} onRemarks={text => setRemarks(r => ({ ...r, [p.id]: text }))}
                onToggleOpen={() => setOpenId(openId === p.id ? null : p.id)}
              />
            ))}
          </div>
          <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: C.paper, borderTop: `1px solid ${C.lineSoft}`, padding: '0.6rem 0.1rem 0.1rem' }}>
            <Btn onClick={toggleAll} disabled={locked}>{chosen.length === review.length ? 'Clear selection' : 'Select all'}</Btn>
            <span style={small}>{chosen.length} selected</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.4rem' }}>
              <Btn onClick={() => act('reject')} disabled={locked || chosen.length === 0}>{busy === 'reject' ? '…' : 'Not these'}</Btn>
              <Btn variant="primary" size="md" icon={busy === 'build' ? undefined : 'hammer'} onClick={() => act('build')} disabled={locked || chosen.length === 0}>
                {busy === 'build' ? <><Spinner size={11} color="#F7F6F2" /> Starting…</> : chosen.length > 1 ? `Build ${chosen.length} tools` : 'Build tool'}
              </Btn>
            </span>
          </div>
        </Section>
      )}

      {working.length > 0 && (
        <Section title="Being built" count={working.length}>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {working.map(p => (
              <ProposalCard key={p.id} proposal={p} selected={false} remarks="" open={openId === p.id} disabled onSelect={() => undefined} onRemarks={() => undefined} onToggleOpen={() => setOpenId(openId === p.id ? null : p.id)} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Tools for this site" count={tools.length} hint={tools.length ? 'Manage them in the Tools tab of the agent.' : undefined}>
        {tools.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 10, padding: '1.1rem', textAlign: 'center', background: C.paper }}>
            <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0 }}>{proposals.length === 0 ? 'No tools yet. Press Find tools to get suggestions.' : 'No tool has been built yet.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {tools.map(t => {
              const proposal = built.find(p => p.tool_name === t.name);
              return (
                <div key={t.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '0.55rem 0.8rem', background: '#fff', opacity: t.enabled ? 1 : 0.6, display: 'grid', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <IconTile icon="wrench" color={t.verified_at ? C.green : C.brassDeep} size={24} />
                    <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: C.ink }}>{t.name}</span>
                    <Chip tone={t.verified_at ? 'green' : 'brass'}>{t.verified_at ? 'Verified' : 'Not verified'}</Chip>
                    {t.runs_in && <Chip tone="slate">{RUNS_IN_TEXT[t.runs_in]}</Chip>}
                    {!t.enabled && <Chip>Off</Chip>}
                    <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '0.64rem', color: C.muted }}>{t.usage_count} use{t.usage_count === 1 ? '' : 's'}</span>
                  </div>
                  {t.description && <p style={{ ...small, color: C.body }}>{t.description}</p>}
                  {t.fail_count > 0 && t.last_error && <p style={{ ...small, color: C.red }}>Failed {t.fail_count} time{t.fail_count === 1 ? '' : 's'} in a row: {t.last_error}</p>}
                  {proposal?.remarks && <p style={small}><b>Your remarks:</b> {proposal.remarks}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {rejected.length > 0 && (
        <div>
          <Btn variant="ghost" icon={showRejected ? 'chevron-down' : 'chevron-right'} onClick={() => setShowRejected(v => !v)}>{`Turned down (${rejected.length})`}</Btn>
          {showRejected && (
            <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.4rem' }}>
              {rejected.map(p => (
                <p key={p.id} style={{ ...small, paddingLeft: '0.5rem' }}><span style={{ fontFamily: MONO }}>{p.name}</span> — {p.title}{p.remarks ? ` · ${p.remarks}` : ''}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
