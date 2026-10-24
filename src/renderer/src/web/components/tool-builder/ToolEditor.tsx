// components/tool-builder/ToolEditor.tsx
'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { HeaderButton } from '@/components/agent-ui/TabHeader';
import { AssetsSection } from './AssetsSection';
import { BasicsSection } from './BasicsSection';
import { CodeSection } from './CodeSection';
import { ExecutionSection } from './ExecutionSection';
import { STEPS, type StepId } from './meta';
import { OutputSection } from './OutputSection';
import { SecretsSection } from './SecretsSection';
import { TestPanel, type TestDraft } from './TestPanel';
import { ToolGuideButton } from './ToolGuide';
import { VariablesSection } from './VariablesSection';
import { Btn, Chip, FIELD_CSS, Notice, Panel, Spinner, Toggle } from './ui';
import {
  CONFIG_SCHEMA_VERSION, DEFAULT_BODY, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS, TOOL_NAME_RE,
  buildFullCode, buildSignature, cleanVariable, extractBody, formatIssue, isFileType, isValidParamName, parseDefault, splitList, upgradeVariable,
  type ToolAsset, type ToolConfig, type ToolOutput, type ToolVariable, type Tool, type ValidationIssue,
} from './types';

// The Tool Builder editor: six steps (Basics, Inputs, Output, Code, Files & limits, Test & save) with a rail on the left that shows where you are, which
// steps are done and which have a problem. One step is on screen at a time; every step can be opened at any time. Saving is the last step, after a test.

interface ServerValidation { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }
interface Issues { name: string[]; variables: string[]; code: string[]; preamble: string[]; output: string[]; access: string[]; other: string[] }
const NO_ISSUES: Issues = { name: [], variables: [], code: [], preamble: [], output: [], access: [], other: [] };

interface Problem { step: StepId; message: string }

const OUTPUT_LABEL: Record<string, string> = { value: 'Returns a value', file: 'Returns a file', value_and_file: 'Value and file' };

export function ToolEditor({ orgId, agentId, existing, onCancel, onSaved }: {
  orgId:    string | undefined;
  agentId:  string;
  existing: Tool | null;
  onCancel: () => void;
  onSaved:  (t: Tool) => void;
}) {
  const cfg = existing?.config;
  const [name, setName]               = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [context, setContext]         = useState(cfg?.context ?? '');
  const [variables, setVariables]     = useState<ToolVariable[]>((cfg?.variables ?? []).map(upgradeVariable));
  const [preamble, setPreamble]       = useState(cfg?.preamble ?? '');
  const [body, setBody]               = useState(cfg?.code ? extractBody(cfg.code) : DEFAULT_BODY);
  const [enabled, setEnabled]         = useState(existing?.enabled ?? true);
  const [selectedSecrets, setSelectedSecrets] = useState<string[]>(cfg?.secrets ?? []);
  const [packagesText, setPackagesText] = useState((cfg?.packages ?? []).join('\n'));
  const [timeoutSeconds, setTimeoutSeconds] = useState(cfg?.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS);
  const [output, setOutput]           = useState<ToolOutput>(cfg?.output ?? { kind: 'value', description: '' });
  const [assets, setAssets]           = useState<ToolAsset[]>(cfg?.assets ?? []);
  const [safeForPlanning, setSafeForPlanning] = useState(cfg?.safe_for_planning ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [issues, setIssues] = useState<Issues>(NO_ISSUES);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [localIssue, setLocalIssue] = useState<Problem | null>(null);

  // Where the author is, and which steps they have opened (a new tool starts with only Basics open; an existing one has been through all of them).
  const [step, setStep] = useState<StepId>('basics');
  const [visited, setVisited] = useState<Set<StepId>>(() => new Set<StepId>(existing ? STEPS.map(x => x.id) : ['basics']));
  const [tested, setTested] = useState<{ ok: boolean; key: string } | null>(null);

  const cleaned = useMemo(() => variables.map(cleanVariable), [variables]);
  const signature = useMemo(() => buildSignature(cleaned), [cleaned]);

  const goTo = (id: StepId) => {
    setStep(id);
    setVisited(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  };
  const stepIndex = STEPS.findIndex(x => x.id === step);

  // Client-side checks that need no server: catch the obvious problems instantly, and say which step they belong to.
  const localProblem = (): Problem | null => {
    const trimmed = name.trim();
    if (!TOOL_NAME_RE.test(trimmed)) return { step: 'basics', message: 'Tool name must be lowercase letters, numbers and underscores (3–64 characters), starting with a letter, e.g. get_weather.' };
    if (existing && trimmed !== existing.name && assets.length > 0) {
      return { step: 'basics', message: `This tool has attached files stored under "${existing.name}". Remove them (or keep the name) before renaming, or they would be orphaned.` };
    }
    const names = cleaned.map(v => v.name);
    for (const v of cleaned) {
      if (!v.name) return { step: 'inputs', message: 'Every input needs a name.' };
      if (!isValidParamName(v.name)) return { step: 'inputs', message: `'${v.name}' isn't a valid Python parameter name. Use letters, numbers and underscores, and don't start with a number.` };
      if (v.data_type === 'enum' && (v.options?.length ?? 0) === 0) return { step: 'inputs', message: `'${v.name}' is a choice: list at least one option.` };
    }
    const dupe = names.find((n, i) => names.indexOf(n) !== i);
    if (dupe) return { step: 'inputs', message: `Input name '${dupe}' is used more than once.` };
    for (const v of variables) {
      if (v._defaultText && !parseDefault(v.data_type, v._defaultText).ok) return { step: 'inputs', message: `'${v.name}': the default value isn't a valid ${v.data_type}.` };
    }
    if (!body.trim()) return { step: 'code', message: 'Tool code is required.' };
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < MIN_TIMEOUT_SECONDS || timeoutSeconds > MAX_TIMEOUT_SECONDS) {
      return { step: 'access', message: `Time limit must be between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} seconds.` };
    }
    return null;
  };

  const buildConfig = (): ToolConfig => ({
    schema_version: CONFIG_SCHEMA_VERSION,
    context: context.trim(),
    code: buildFullCode(cleaned, body),
    ...(preamble.trim() ? { preamble } : {}),
    entrypoint: 'run',
    variables: cleaned,
    secrets: selectedSecrets,
    packages: splitList(packagesText),
    timeout_seconds: Math.round(timeoutSeconds),
    output: { kind: output.kind, description: output.description.trim() },
    assets,
    safe_for_planning: safeForPlanning,
  });

  // A test only counts for the draft it ran on: any later edit makes the result stale.
  const draftKey = JSON.stringify({ name: name.trim(), config: buildConfig() });
  const testStale = tested !== null && tested.key !== draftKey;
  const testPassed = tested !== null && tested.ok && !testStale;

  // The authoritative check (bemain): name collisions with built-in tools, Python syntax with line numbers, run() matching the variables, package specs.
  const serverValidate = async (config: ToolConfig): Promise<ServerValidation | null> => {
    try {
      const res = await fetch('/api/tools/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId, name: name.trim(), existing_name: existing?.name ?? null,
          code: config.code, preamble: config.preamble ?? '', variables: config.variables,
          packages: config.packages ?? [], output: config.output,
        }),
      });
      const data = await res.json();
      return Array.isArray(data.errors) ? (data as ServerValidation) : null;
    } catch { return null; }
  };

  const applyValidation = (v: ServerValidation): Issues => {
    const next: Issues = { name: [], variables: [], code: [], preamble: [], output: [], access: [], other: [] };
    for (const issue of v.errors) {
      const bucket = issue.field === 'name' ? next.name
        : issue.field === 'variables' ? next.variables
        : issue.field === 'code' ? next.code
        : issue.field === 'preamble' ? next.preamble
        : issue.field === 'output' ? next.output
        : issue.field === 'packages' ? next.access
        : next.other;
      bucket.push(formatIssue(issue));
    }
    setIssues(next);
    setWarnings(v.warnings.map(formatIssue));
    return next;
  };

  // The first step that has a problem, so a failed save or test takes the author straight to it.
  const firstProblemStep = (i: Issues): StepId => (
    i.name.length ? 'basics' : i.variables.length ? 'inputs' : i.output.length ? 'output' : i.code.length || i.preamble.length ? 'code' : i.access.length ? 'access' : 'test'
  );

  // Shared by Save and Test: local checks, then the server's. Returns the config when the draft is sound, else null with the problems already on screen.
  const validateDraft = async (): Promise<ToolConfig | null> => {
    setError(''); setIssues(NO_ISSUES); setWarnings([]); setLocalIssue(null);
    const problem = localProblem();
    if (problem) { setError(problem.message); setLocalIssue(problem); goTo(problem.step); return null; }
    const config = buildConfig();
    const result = await serverValidate(config);
    if (!result) { setError('Could not reach the validation service. Please try again.'); return null; }
    const found = applyValidation(result);
    if (!result.ok) { setError('Fix the highlighted problems first.'); goTo(firstProblemStep(found)); return null; }
    return config;
  };

  const handleSave = async () => {
    setSaving(true);
    const config = await validateDraft();
    if (!config) { setSaving(false); return; }

    const supabase = createClient();
    const fields = { name: name.trim(), description: description.trim() || null, config, enabled };
    const query = existing
      ? supabase.from('tools').update(fields).eq('id', existing.id).select().single()
      : supabase.from('tools').insert({ agent_id: agentId, type: 'custom', ...fields }).select().single();
    const { data, error: dbErr } = await query;
    setSaving(false);
    if (dbErr) {
      setError(dbErr.code === '23505' ? 'This agent already has a tool with that name.' : 'Something went wrong. Please try again.');
      if (dbErr.code === '23505') goTo('basics');
      return;
    }
    onSaved(data as Tool);
  };

  const getDraft = async (): Promise<TestDraft> => {
    const config = await validateDraft();
    if (!config) return { error: 'Fix the problems shown, then run the test again.' };
    return {
      // Attached files are stored under the SAVED name, so the test must use it.
      name: existing?.name ?? name.trim(), code: config.code, preamble: config.preamble ?? '',
      variables: config.variables, secrets: config.secrets, assets: config.assets ?? [],
      packages: config.packages ?? [], timeout_seconds: config.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS,
      output: config.output ?? { kind: 'value', description: '' },
    };
  };

  // ── what the rail shows ──────────────────────────────────────────────────────
  const variablesOk = cleaned.every(v => v.name && isValidParamName(v.name) && (v.data_type !== 'enum' || (v.options?.length ?? 0) > 0));
  const hasProblem: Record<StepId, boolean> = {
    basics: issues.name.length > 0 || localIssue?.step === 'basics',
    inputs: issues.variables.length > 0 || localIssue?.step === 'inputs',
    output: issues.output.length > 0,
    code: issues.code.length > 0 || issues.preamble.length > 0 || localIssue?.step === 'code',
    access: issues.access.length > 0 || localIssue?.step === 'access',
    test: false,
  };
  const done: Record<StepId, boolean> = {
    basics: TOOL_NAME_RE.test(name.trim()) && description.trim() !== '',
    inputs: visited.has('inputs') && variablesOk,
    output: visited.has('output'),
    code: visited.has('code') && body.trim() !== '',
    access: visited.has('access'),
    test: testPassed,
  };
  const secretCount = selectedSecrets.length;
  const extras = assets.length + splitList(packagesText).length;
  const caption: Record<StepId, string> = {
    basics: name.trim() || 'Name and purpose',
    inputs: cleaned.length === 0 ? 'No inputs' : `${cleaned.length} input${cleaned.length === 1 ? '' : 's'}`,
    output: OUTPUT_LABEL[output.kind] ?? 'What comes back',
    code: secretCount > 0 ? `Python · ${secretCount} secret${secretCount === 1 ? '' : 's'}` : 'Python',
    access: extras > 0 ? `${extras} item${extras === 1 ? '' : 's'} set` : 'Optional',
    test: testPassed ? 'Passed' : testStale ? 'Changed since test' : tested && !tested.ok ? 'Last test failed' : 'Not tested yet',
  };

  const hasFileVariable = cleaned.some(v => isFileType(v.data_type));
  const current = STEPS[stepIndex];

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: C.surface, fontFamily: "'Inter', 'Helvetica Neue', sans-serif", color: C.ink }}>
      <style>{FIELD_CSS}</style>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '1.1rem 2rem 2.5rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
          <Btn variant="ghost" size="sm" icon="arrow-left" onClick={onCancel}>All tools</Btn>
          <span aria-hidden style={{ width: 1, height: 20, background: C.line }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: '1 1 170px' }}>
            <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, color: '#514726', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name.trim() || 'New tool'}
            </h1>
            <Chip tone={existing ? 'slate' : 'brass'}>{existing ? 'Editing' : 'Draft'}</Chip>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ToolGuideButton />
            {existing && (
              <HeaderButton variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save changes'}</HeaderButton>
            )}
          </div>
        </header>

        <div className="tbx-layout" style={{ display: 'flex', gap: '1.6rem', alignItems: 'flex-start' }}>
          <nav className="tbx-rail" aria-label="Tool steps" style={{ position: 'sticky', top: '0.5rem', width: 232, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {STEPS.map((x, i) => {
              const active = x.id === step;
              const problem = hasProblem[x.id];
              const complete = done[x.id] && !problem;
              return (
                <button key={x.id} type="button" className="tbx-step" aria-current={active ? 'step' : undefined} onClick={() => goTo(x.id)}>
                  <span
                    aria-hidden
                    style={{
                      width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
                      color: problem ? C.red : complete ? C.green : active ? C.brassDeep : C.muted,
                      background: problem ? C.redWash : complete ? C.greenWash : active ? C.brassWash : '#EDEBE2',
                      border: `1px solid ${problem ? C.redLine : complete ? C.greenLine : active ? C.brassLine : '#DAD5C5'}`,
                    }}
                  >
                    {problem ? <Icon name="triangle-alert" size={14} /> : complete ? <Icon name="check" size={14} strokeWidth={2.5} /> : <Icon name={x.icon} size={14} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: active ? 500 : 400, color: active ? C.ink : C.body }}>
                      <span style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, marginRight: '0.4rem' }}>{i + 1}</span>{x.title}
                    </span>
                    <span className="tbx-step-caption" style={{ display: 'block', fontSize: '0.7rem', color: problem ? C.red : C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                      {problem ? 'Needs attention' : caption[x.id]}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <main style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontFamily: MONO, fontSize: '0.66rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.3rem' }}>
                Step {stepIndex + 1} of {STEPS.length}{current.optional ? ' · optional' : ''}
              </p>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0, color: C.ink }}>{current.heading}</h2>
              <p style={{ fontSize: '0.84rem', color: C.soft, margin: '0.3rem 0 0', lineHeight: 1.6, maxWidth: 680 }}>{current.purpose}</p>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {step === 'basics' && (
                <BasicsSection
                  name={name} onName={setName} description={description} onDescription={setDescription} context={context} onContext={setContext}
                  nameIssues={issues.name} signature={signature}
                />
              )}
              {step === 'inputs' && <VariablesSection variables={variables} onChange={setVariables} issues={issues.variables} />}
              {step === 'output' && <OutputSection output={output} onChange={setOutput} />}
              {step === 'code' && (
                <>
                  <SecretsSection
                    agentId={agentId} selected={selectedSecrets}
                    onToggle={n => setSelectedSecrets(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])}
                  />
                  <CodeSection
                    signature={signature} preamble={preamble} onPreambleChange={setPreamble} body={body} onBodyChange={setBody}
                    bodyIssues={issues.code} preambleIssues={issues.preamble} warnings={warnings}
                  />
                </>
              )}
              {step === 'access' && (
                <>
                  <AssetsSection orgId={orgId} agentId={agentId} existing={existing} assets={assets} onAssetsChange={setAssets} />
                  <ExecutionSection
                    timeoutSeconds={timeoutSeconds} onTimeoutChange={setTimeoutSeconds}
                    packagesText={packagesText} onPackagesChange={setPackagesText}
                    safeForPlanning={safeForPlanning} onSafeForPlanningChange={setSafeForPlanning}
                  />
                  {issues.access.length > 0 && <Notice tone="error">{issues.access.map((m, i) => <p key={i} style={{ margin: i ? '0.25rem 0 0' : 0, fontFamily: MONO, fontSize: '0.74rem' }}>{m}</p>)}</Notice>}
                </>
              )}
              {step === 'test' && (
                <>
                  <TestPanel agentId={agentId} variables={cleaned} getDraft={getDraft} stale={testStale} onResult={ok => setTested({ ok, key: draftKey })} />
                  <Panel icon="rocket" color={C.green} title="Ready to save" description="A last look at each step. Open any of them to change it.">
                    <div style={{ display: 'grid', gap: '0.1rem', marginBottom: '1.1rem' }}>
                      {STEPS.filter(x => x.id !== 'test').map(x => {
                        const problem = hasProblem[x.id];
                        const ok = done[x.id] && !problem;
                        return (
                          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0.2rem', borderBottom: `1px solid ${C.lineSoft}` }}>
                            <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', background: problem ? C.red : ok ? C.green : '#C9C4B2' }}>
                              <Icon name={problem ? 'x' : 'check'} size={11} strokeWidth={3} />
                            </span>
                            <span style={{ fontSize: '0.82rem', color: C.ink, minWidth: 110 }}>{x.title}</span>
                            <span style={{ fontSize: '0.76rem', color: problem ? C.red : C.soft, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{problem ? 'Needs attention' : caption[x.id]}</span>
                            <Btn variant="ghost" size="sm" onClick={() => goTo(x.id)}>Edit</Btn>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 0.9rem', background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: '1rem' }}>
                      <div>
                        <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: '0 0 0.15rem' }}>Available to the agent</p>
                        <p style={{ fontSize: '0.76rem', color: C.soft, margin: 0 }}>{enabled ? 'The agent can call this tool as soon as it is saved.' : 'Saved but not offered to the agent.'}</p>
                      </div>
                      <Toggle on={enabled} onClick={() => setEnabled(e => !e)} label="Available to the agent" />
                    </div>

                    {!testPassed && (
                      <Notice tone="info" style={{ marginBottom: '1rem' }}>
                        {testStale ? 'You changed the tool after the last test.' : tested && !tested.ok ? 'The last test did not pass.' : 'This tool has not been tested.'} You can still save it, but a passing test is the surest way to know it works.
                      </Notice>
                    )}
                    {hasFileVariable && !testPassed && (
                      <p style={{ fontSize: '0.74rem', color: C.muted, margin: '-0.4rem 0 1rem' }}>File inputs are tested against your own workspace.</p>
                    )}

                    <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Btn onClick={onCancel}>Cancel</Btn>
                      <Btn variant="primary" icon={saving ? undefined : 'circle-check'} onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving && <Spinner />}{saving ? 'Saving…' : existing ? 'Save changes' : 'Create tool'}
                      </Btn>
                    </div>
                  </Panel>
                </>
              )}
            </div>

            {error && <Notice tone="error" style={{ marginTop: '1rem' }}>{error}</Notice>}
            {issues.other.length > 0 && <Notice tone="error" style={{ marginTop: '0.6rem' }}>{issues.other.map((m, i) => <p key={i} style={{ margin: i ? '0.25rem 0 0' : 0 }}>{m}</p>)}</Notice>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.4rem', paddingTop: '1rem', borderTop: `1px solid ${C.line}` }}>
              {stepIndex > 0 ? <Btn icon="arrow-left" onClick={() => goTo(STEPS[stepIndex - 1].id)}>{STEPS[stepIndex - 1].title}</Btn> : <span />}
              {stepIndex < STEPS.length - 1 && (
                <Btn variant="primary" onClick={() => goTo(STEPS[stepIndex + 1].id)}>
                  {STEPS[stepIndex + 1].title}<Icon name="arrow-right" size={15} />
                </Btn>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
