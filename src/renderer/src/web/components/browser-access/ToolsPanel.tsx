// components/browser-access/ToolsPanel.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { C, MONO } from '@/components/account/tokens';
import { Btn, Chip, ErrorText, IconTile, Spinner, post } from './ui';
import type { Access, BuildPhase, LinkedToolRow, ProposalStatus, Run, ToolProposal } from './types';

// The Tools tab: tools for this site that agents can call directly (the platform logs in for them). "Find tools" starts the tool researcher, which reads what
// agents did here and the tools that already exist, and puts suggestions on a list. Each suggestion has its own Approve (with an optional note) and Delete.
// An approved one is built by a builder agent, tested on the live site and switched on only when the test passed; it then moves to the History tab, still
// linked to the tool it produced. Nothing is built without your approval.

const PROPOSAL_COLUMNS = 'id, name, title, summary, kind, target_tool, motive, est_runtime, completed_at, build_phase, build_progress, runs_in, inputs, returns, changes_data, evidence, approach, sample_inputs, hint, status, remarks, tool_name, verification, error, created_at';
const TOOL_COLUMNS = 'id, name, description, enabled, runs_in, verified_at, fail_count, last_error, usage_count';
const ON_LIST: ProposalStatus[] = ['suggested', 'proposed', 'failed'];
const IN_PROGRESS: ProposalStatus[] = ['approved', 'building'];

const PHASES: { id: BuildPhase; label: string }[] = [{ id: 'study', label: 'Study' }, { id: 'write', label: 'Write and test' }, { id: 'verify', label: 'Verify' }];

const RUNS_IN_TEXT = { page: 'Runs in the page', http: "Calls the site's API" } as const;
const small: React.CSSProperties = { fontSize: '0.72rem', color: C.soft, margin: 0, lineHeight: 1.55 };

function PhaseRail({ proposal }: { proposal: ToolProposal }) {
  const progress = proposal.build_progress;
  if (!progress) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }} aria-label="Build progress">
      {PHASES.map((phase, index) => {
        const entry = progress.phases[phase.id];
        const tone = entry.status === 'done' ? 'green' : entry.status === 'failed' ? 'red' : entry.status === 'active' ? 'brass' : 'neutral';
        return (
          <span key={phase.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            {index > 0 && <span style={{ color: C.muted, fontSize: '0.7rem' }}>›</span>}
            <Chip tone={tone} dot={entry.status === 'active'} title={entry.attempts ? `${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}` : undefined}>{phase.label}</Chip>
          </span>
        );
      })}
      {progress.fix_rounds > 0 && <span style={small}>sent back {progress.fix_rounds}×</span>}
    </div>
  );
}

function SuggestionCard({ proposal, note, open, disabled, deleting, onNote, onToggleOpen, onApprove, onRestart, onDelete }: {
  proposal: ToolProposal; note: string; open: boolean; disabled: boolean; deleting: boolean;
  onNote: (text: string) => void; onToggleOpen: () => void; onApprove: () => void; onRestart: () => void; onDelete: () => void;
}) {
  const building = IN_PROGRESS.includes(proposal.status);
  const upgrade = proposal.kind === 'upgrade';
  const canApprove = ON_LIST.includes(proposal.status);
  const resumeLabel = PHASES.find(p => p.id === proposal.build_phase)?.label;
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '0.7rem 0.85rem', display: 'grid', gap: '0.45rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
        <IconTile icon={upgrade ? 'sparkles' : 'wrench'} color={upgrade ? C.slate : C.brassDeep} size={24} />
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink }}>{proposal.title}</span>
            <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: C.muted }}>{proposal.name}</span>
          </div>
        </div>
        <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip tone={upgrade ? 'slate' : 'brass'}>{upgrade ? `Upgrade · ${proposal.target_tool ?? proposal.name}` : 'New tool'}</Chip>
          <Chip tone="slate">{RUNS_IN_TEXT[proposal.runs_in]}</Chip>
          {proposal.est_runtime && <Chip title="How long one run is expected to take.">{proposal.est_runtime}</Chip>}
          {proposal.changes_data && <Chip tone="amber" title="This tool creates, edits or submits something on the site, not just reads.">Changes data</Chip>}
          {proposal.evidence.length > 0 && <Chip>{`from ${proposal.evidence.length} task${proposal.evidence.length === 1 ? '' : 's'}`}</Chip>}
          {building && <Chip tone="brass" dot>{proposal.status === 'building' ? 'Building' : 'Queued'}</Chip>}
          {proposal.status === 'failed' && <Chip tone="red">Could not build</Chip>}
        </div>
        <Btn icon={open ? 'chevron-down' : 'chevron-right'} onClick={onToggleOpen}>{open ? 'Hide' : 'Details'}</Btn>
      </div>

      <p style={{ fontSize: '0.78rem', color: C.body, margin: 0, lineHeight: 1.55 }}>{proposal.summary}</p>
      {proposal.motive && <p style={small}><b>Why:</b> {proposal.motive}</p>}
      {proposal.status === 'failed' && proposal.error && <ErrorText>{proposal.error}</ErrorText>}
      {upgrade && proposal.status !== 'built' && <p style={small}>Approving an upgrade builds a new version beside the live tool; the live tool is replaced only when the new version has passed review.</p>}
      {(building || proposal.status === 'failed' || proposal.build_progress) && <PhaseRail proposal={proposal} />}

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

      {canApprove && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <textarea
            id={`note-${proposal.id}`} className="ba-field" rows={2} value={note} maxLength={2000} disabled={disabled} aria-label={`Note for the builder about ${proposal.title}`}
            placeholder="Note for the builder (optional): a name, an input, a limit, what to leave out…"
            onChange={e => onNote(e.target.value)} style={{ resize: 'vertical' }}
          />
        </div>
      )}
      {!building && (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <Btn variant="danger" icon="trash" onClick={onDelete} disabled={deleting || disabled}>{deleting ? '…' : 'Delete'}</Btn>
          {proposal.status === 'failed' && proposal.build_progress && (
            <Btn icon="refresh-cw" onClick={onRestart} disabled={disabled} title="Throw away the saved recipe and draft and build it from the start.">Start over</Btn>
          )}
          <Btn variant="primary" size="md" icon="hammer" onClick={onApprove} disabled={disabled || !canApprove}>
            {proposal.status === 'failed' ? (resumeLabel ? `Retry from ${resumeLabel.toLowerCase()}` : 'Approve again') : 'Approve'}
          </Btn>
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
  const [tab, setTab] = useState<'suggestions' | 'history'>('suggestions');
  const [hint, setHint] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const [p, t, r] = await Promise.all([
      supabase.from('tool_proposals').select(PROPOSAL_COLUMNS).eq('access_id', access.id).order('created_at', { ascending: false }).limit(100),
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

  const suggestions = useMemo(() => proposals.filter(p => [...ON_LIST, ...IN_PROGRESS].includes(p.status)), [proposals]);
  const history = useMemo(() => proposals.filter(p => p.status === 'built'), [proposals]);
  const builtNames = useMemo(() => new Set(history.map(p => p.tool_name ?? p.name)), [history]);
  const otherTools = useMemo(() => tools.filter(t => !builtNames.has(t.name)), [tools, builtNames]);
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

  const approve = async (p: ToolProposal, restart = false) => {
    if (restart && !window.confirm('Throw away the saved recipe and draft and build this tool from the start?')) return;
    setBusy(`approve-${p.id}`);
    setError('');
    const result = await post(`/api/agents/${agentId}/browser-access/${access.id}/tools/build`, { selections: [{ id: p.id, remarks: (notes[p.id] ?? '').trim() }], restart });
    setBusy(null);
    if (!result.ok) { setError(result.error || 'Could not start the build.'); return; }
    onChanged();
    load();
  };

  const remove = async (p: ToolProposal) => {
    if (!window.confirm(`Delete the suggestion "${p.title}"?`)) return;
    setBusy(`delete-${p.id}`);
    setError('');
    const { error: failure } = await createClient().from('tool_proposals').delete().eq('id', p.id);
    setBusy(null);
    if (failure) { setError(failure.message || 'Could not delete that suggestion.'); return; }
    setProposals(list => list.filter(x => x.id !== p.id));
  };

  if (!loaded) return <p style={{ fontSize: '0.76rem', color: C.muted, margin: 0 }}>Loading…</p>;

  const runWord = run?.kind === 'build' ? 'Building the tool you approved' : 'Looking through what agents did here';
  const tabButton = (id: 'suggestions' | 'history', label: string, count: number) => (
    <button
      type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
      style={{ background: tab === id ? '#fff' : 'transparent', border: `1px solid ${tab === id ? C.line : 'transparent'}`, borderRadius: 8, padding: '0.3rem 0.75rem', fontSize: '0.76rem', fontWeight: tab === id ? 600 : 400, color: tab === id ? C.ink : C.soft, cursor: 'pointer' }}
    >
      {label} <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted }}>{count}</span>
    </button>
  );

  return (
    <div style={{ display: 'grid', gap: '1.1rem' }}>
      <p style={{ ...small, fontSize: '0.74rem' }}>
        A tool is a saved, tested script for a job agents keep doing on this site. An agent calls it directly: the platform signs in, runs it and closes the browser, so a task needs no login or logout step.
        Nothing is built until you approve a suggestion, and you can delete or switch off any tool afterwards.
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
          <span style={small}>It reads past tasks, the suggestions already on the list and the tools already built, then adds only what is new or worth upgrading.</span>
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

      <div style={{ display: 'inline-flex', gap: '0.25rem', background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: '0.2rem', justifySelf: 'start' }}>
        {tabButton('suggestions', 'Suggestions', suggestions.length)}
        {tabButton('history', 'History', history.length + otherTools.length)}
      </div>

      {tab === 'suggestions' && (
        suggestions.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 10, padding: '1.1rem', textAlign: 'center', background: C.paper }}>
            <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0 }}>No suggestions on the list. Press Find tools to look for repeated jobs.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {suggestions.map(p => (
              <SuggestionCard
                key={p.id} proposal={p} note={notes[p.id] ?? ''} open={openId === p.id} disabled={locked} deleting={busy === `delete-${p.id}`}
                onNote={text => setNotes(n => ({ ...n, [p.id]: text }))} onToggleOpen={() => setOpenId(openId === p.id ? null : p.id)}
                onApprove={() => approve(p)} onRestart={() => approve(p, true)} onDelete={() => remove(p)}
              />
            ))}
          </div>
        )
      )}

      {tab === 'history' && (
        history.length === 0 && otherTools.length === 0 ? (
          <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 10, padding: '1.1rem', textAlign: 'center', background: C.paper }}>
            <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0 }}>Nothing built yet. Approved suggestions land here once their tool is built and tested.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {history.map(p => {
              const tool = tools.find(t => t.name === (p.tool_name ?? p.name));
              return (
                <div key={p.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '0.55rem 0.8rem', background: '#fff', opacity: tool && !tool.enabled ? 0.6 : 1, display: 'grid', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <IconTile icon="circle-check" color={C.green} size={24} />
                    <span style={{ fontSize: '0.82rem', color: C.ink }}>{p.title}</span>
                    <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: C.muted }}>{p.tool_name ?? p.name}</span>
                    <Chip tone={tool?.verified_at ? 'green' : 'brass'}>{tool ? (tool.verified_at ? 'Verified' : 'Not verified') : 'Tool removed'}</Chip>
                    {tool && !tool.enabled && <Chip>Off</Chip>}
                    {p.kind === 'upgrade' && <Chip tone="slate">Upgrade</Chip>}
                    <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '0.64rem', color: C.muted }}>
                      {tool ? `${tool.usage_count} use${tool.usage_count === 1 ? '' : 's'}` : ''}{p.completed_at ? ` · built ${new Date(p.completed_at).toLocaleDateString()}` : ''}
                    </span>
                  </div>
                  <p style={{ ...small, color: C.body }}>{p.summary}</p>
                  {p.verification && <p style={{ ...small, color: C.green }}>{p.verification.split('\n')[0]}</p>}
                  {tool && tool.fail_count > 0 && tool.last_error && <p style={{ ...small, color: C.red }}>Failed {tool.fail_count} time{tool.fail_count === 1 ? '' : 's'} in a row: {tool.last_error}</p>}
                  {p.remarks && <p style={small}><b>Your note:</b> {p.remarks}</p>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn variant="ghost" icon="trash" onClick={() => remove(p)} disabled={locked}>Remove from history</Btn>
                  </div>
                </div>
              );
            })}
            {otherTools.map(t => (
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
              </div>
            ))}
            <p style={small}>Manage a built tool (switch off, edit, delete) in the Tools tab of the agent.</p>
          </div>
        )
      )}
    </div>
  );
}
