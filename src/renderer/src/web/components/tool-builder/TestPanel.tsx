// components/tool-builder/TestPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { TYPE_ICON } from './meta';
import { Btn, Chip, Notice, Panel, Spinner } from './ui';
import { isFileType, testInputValue, typeLabel, type ToolVariable } from './types';

// What the editor hands the panel to run — the unsaved draft, exactly as it
// would be saved. `error` short-circuits the run with a message.
export type TestDraft =
  | { error: string }
  | {
      name: string; code: string; preamble: string; variables: ToolVariable[]; secrets: string[];
      assets: { filename: string; size_bytes: number }[]; packages: string[]; timeout_seconds: number;
      output: { kind: string; description: string };
    };

interface TestResult {
  ok: boolean;
  value?: unknown;
  file?: string;
  files?: string[];
  stdout?: string;
  error?: string;
}

// Workspace paths offered as suggestions on file inputs — the signed-in admin's
// own sub-workspace (what a test run reads from, same as a live run would).
function useWorkspaceFiles(agentId: string, enabled: boolean): string[] {
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/workspace/list`);
        const data = await res.json();
        const projects: { slug: string }[] = data.projects ?? [];
        const lists = await Promise.all(projects.slice(0, 12).map(async p => {
          const r = await fetch(`/api/agents/${agentId}/workspace/list?project=${encodeURIComponent(p.slug)}`);
          const d = await r.json();
          return ((d.files ?? []) as { path: string }[]).map(f => f.path);
        }));
        if (!cancelled) setPaths(lists.flat());
      } catch { /* suggestions are a convenience — typing a path still works */ }
    })();
    return () => { cancelled = true; };
  }, [agentId, enabled]);
  return paths;
}

export function TestPanel({ agentId, variables, getDraft, onResult, stale }: {
  agentId: string;
  variables: ToolVariable[];
  getDraft: () => Promise<TestDraft>;
  /** true / false once a test has passed / failed, so the editor can say whether the saved version was tested */
  onResult: (ok: boolean) => void;
  /** the draft changed after the last test, so its result no longer describes it */
  stale: boolean;
}) {
  const named = variables.filter(v => v.name.trim());
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const workspaceFiles = useWorkspaceFiles(agentId, named.some(v => isFileType(v.data_type)));

  const run = async () => {
    setRunning(true); setResult(null);
    const draft = await getDraft();
    if ('error' in draft) { setResult({ ok: false, error: draft.error }); setRunning(false); onResult(false); return; }

    const payload: Record<string, unknown> = {};
    for (const v of named) {
      const parsed = testInputValue(v, inputs[v.name] ?? '');
      if (!parsed.ok) { setResult({ ok: false, error: parsed.error }); setRunning(false); onResult(false); return; }
      if (parsed.value !== undefined) payload[v.name] = parsed.value;
    }

    try {
      const res = await fetch('/api/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, ...draft, inputs: payload }),
      });
      const data = (await res.json()) as TestResult;
      setResult(data);
      onResult(!!data.ok);
    } catch {
      setResult({ ok: false, error: 'Network error reaching the test endpoint.' });
      onResult(false);
    }
    setRunning(false);
  };

  const download = async (path: string) => {
    const res = await fetch(`/api/agents/${agentId}/workspace/download?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.ok && data.url) window.open(data.url, '_blank');
  };

  return (
    <Panel
      icon="flask-conical" color={C.brassDeep} title="Test run"
      description="Runs your unsaved draft the way a real call does: same sandbox, same input checks, your real secrets and attached files."
      aside={result ? (stale ? <Chip tone="neutral">Changed since</Chip> : result.ok ? <Chip tone="green">Passed</Chip> : <Chip>Failed</Chip>) : undefined}
    >
      <Notice tone="warning" style={{ marginBottom: '1rem' }}>
        Secrets are real. A test that sends an email or writes to an API really does it.
      </Notice>

      {named.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem 1rem', margin: '0 0 1rem' }}>
          {named.map(v => (
            <div key={v.name}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: C.body, marginBottom: '0.3rem' }}>
                <Icon name={TYPE_ICON[v.data_type]} size={12} color={C.muted} />
                <span style={{ fontFamily: MONO }}>{v.name}</span>
                <span style={{ color: C.muted }}>{typeLabel(v.data_type)}{v.required ? '' : ', optional'}</span>
              </label>
              {v.data_type === 'boolean' ? (
                <select className="tool-field tool-field-sm" value={inputs[v.name] ?? ''} onChange={e => setInputs(p => ({ ...p, [v.name]: e.target.value }))}>
                  <option value="">—</option><option value="true">true</option><option value="false">false</option>
                </select>
              ) : v.data_type === 'enum' ? (
                <select className="tool-field tool-field-sm" value={inputs[v.name] ?? ''} onChange={e => setInputs(p => ({ ...p, [v.name]: e.target.value }))}>
                  <option value="">—</option>
                  {(v.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className="tool-field tool-field-sm"
                  list={isFileType(v.data_type) ? `ws-files-${agentId}` : undefined}
                  placeholder={
                    v.data_type === 'date' ? 'YYYY-MM-DD'
                    : v.data_type === 'datetime' ? '2025-01-31T14:30:00Z'
                    : v.data_type === 'time' ? 'HH:MM'
                    : v.data_type === 'list' ? '["a", "b"]'
                    : v.data_type === 'object' ? '{"key": "value"}'
                    : v.data_type === 'file' ? 'workspace file path'
                    : v.data_type === 'file_list' ? 'path one, path two'
                    : typeLabel(v.data_type)
                  }
                  value={inputs[v.name] ?? ''} onChange={e => setInputs(p => ({ ...p, [v.name]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <datalist id={`ws-files-${agentId}`}>{workspaceFiles.map(p => <option key={p} value={p} />)}</datalist>
        </div>
      ) : (
        <p style={{ fontSize: '0.8rem', color: C.soft, margin: '0 0 1rem' }}>This tool takes no inputs, so there is nothing to fill in.</p>
      )}
      {named.some(v => isFileType(v.data_type)) && (
        <p style={{ fontSize: '0.72rem', color: C.muted, margin: '-0.4rem 0 1rem' }}>File inputs are read from <em>your own</em> workspace, the same place a live call from you reads them.</p>
      )}

      <Btn variant="primary" icon={running ? undefined : 'play'} onClick={run} disabled={running}>
        {running && <Spinner size={13} />}{running ? 'Running…' : 'Run test'}
      </Btn>

      {result && (
        <div style={{ marginTop: '1.1rem', padding: '0.9rem 1rem', borderRadius: 10, background: result.ok ? C.greenWash : C.redWash, border: `1px solid ${result.ok ? C.greenLine : C.redLine}`, opacity: stale ? 0.7 : 1 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: MONO, fontSize: '0.66rem', color: result.ok ? C.green : C.red, margin: '0 0 0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <Icon name={result.ok ? 'circle-check' : 'triangle-alert'} size={13} />{result.ok ? 'Success' : 'Error'}{stale ? ' · before your latest changes' : ''}
          </p>
          <pre style={{ margin: 0, fontSize: '0.78rem', color: C.body, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: MONO, maxHeight: 320, overflowY: 'auto' }}>
            {result.ok ? JSON.stringify(result.value ?? null, null, 2) : result.error}
          </pre>
          {result.ok && (result.files?.length ?? 0) > 0 && (
            <div style={{ marginTop: '0.8rem' }}>
              <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.green, margin: '0 0 0.35rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Files produced</p>
              {result.files!.map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                  <Icon name="file" size={13} color={C.green} />
                  <span style={{ fontFamily: MONO, fontSize: '0.75rem', color: C.body, wordBreak: 'break-all' }}>{p.split('/').slice(-1)[0]}</span>
                  <Btn size="sm" onClick={() => download(p)}>Download</Btn>
                </div>
              ))}
            </div>
          )}
          {!!result.stdout && (
            <>
              <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, margin: '0.8rem 0 0.25rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Printed output</p>
              <pre style={{ margin: 0, fontSize: '0.75rem', color: C.soft, whiteSpace: 'pre-wrap', fontFamily: MONO }}>{result.stdout}</pre>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
