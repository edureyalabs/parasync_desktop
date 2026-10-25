// src/renderer/src/components/LocalSecretsCard.tsx
// Desktop-only. The secrets this PC keeps for the signed-in person (API keys, saved website logins) so tools can run here without the cloud
// ever sending a secret down. The page can add, check and remove them but never read one back: values go in and stay in the main process.
import { useEffect, useState } from 'react';

import { Button, ErrorText } from '~/components/ui';
import { useVault, type CloudState, type VaultRow } from '~/hooks/useVault';
import { useAuth } from '~/lib/auth';
import { keepingCopies, NO_AUTO_COPY_HEADER, setKeepingCopies } from '~/lib/localCopy';
import { supabase } from '~/lib/supabase';

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '11px 18px', borderBottom: '1px solid #E2DFD3', fontSize: 13.5 } as const;
const input = { width: '100%', boxSizing: 'border-box', height: 34, padding: '0 10px', border: '1px solid #DAD5C5', borderRadius: 7, fontSize: 13, background: '#fff', color: '#26251E' } as const;
const label = { display: 'block', fontSize: 12, color: '#67655A', margin: '10px 0 4px' } as const;

const KIND: Record<string, string> = { secret: 'Agent secret', user_secret: 'My key', browser_access: 'Website login' };
const CLOUD: Record<CloudState, { text: string; tone: string }> = {
  same: { text: 'Up to date', tone: '#3F6B4A' },
  newer: { text: 'Out of date: the cloud has a newer one, save it again here', tone: '#B4442A' },
  gone: { text: 'The cloud no longer has this', tone: '#B4442A' },
  'pc-only': { text: 'On this PC only', tone: '#67655A' },
  unknown: { text: '', tone: '#9E9C8F' },
};

const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

interface AgentOption { id: string; name: string; owner: boolean }

/** Agents the person owns (they may keep the agent's secrets) and agents they are connected to (they may keep their own keys). */
async function loadAgents(userId: string): Promise<AgentOption[]> {
  const out: AgentOption[] = [];
  const { data: orgs } = await supabase.from('organizations').select('id').eq('owner_id', userId);
  const orgIds = (orgs ?? []).map((o) => o.id as string);
  if (orgIds.length > 0) {
    const { data } = await supabase.from('agents').select('id, name').in('org_id', orgIds);
    for (const a of data ?? []) out.push({ id: a.id as string, name: a.name as string, owner: true });
  }
  const { data: net } = await supabase.from('agent_network').select('agent_id').eq('user_id', userId);
  const connected = (net ?? []).map((n) => n.agent_id as string).filter((id) => !out.some((o) => o.id === id));
  if (connected.length > 0) {
    const { data } = await supabase.from('agents').select('id, name').in('id', connected);
    for (const a of data ?? []) out.push({ id: a.id as string, name: a.name as string, owner: false });
  }
  return out;
}

function AddSecret({ onSaved, put }: { onSaved: () => void; put: ReturnType<typeof useVault>['put'] }) {
  const { session } = useAuth();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState('');
  const [kind, setKind] = useState<'secret' | 'user_secret'>('secret');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [hosts, setHosts] = useState('');
  const [importable, setImportable] = useState(false);
  const [alsoCloud, setAlsoCloud] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = session?.user.id;
    if (id) void loadAgents(id).then((list) => { setAgents(list); setAgentId((cur) => cur || list[0]?.id || ''); }).catch(() => undefined);
  }, [session?.user.id]);

  const agent = agents.find((a) => a.id === agentId);
  const effectiveKind: 'secret' | 'user_secret' = agent?.owner === false ? 'user_secret' : kind;

  async function save() {
    setError(null);
    const cleanName = name.trim();
    if (!agent) return setError('Choose an agent.');
    if (!/^[A-Z][A-Z0-9_]*$/.test(cleanName)) return setError('The name must be CAPITAL_LETTERS_WITH_UNDERSCORES, like STRIPE_KEY.');
    if (!value) return setError('Enter the value.');
    const hostList = hosts.split(/[\s,]+/).map((h) => h.trim().toLowerCase()).filter(Boolean);
    setBusy(true);
    try {
      const path = effectiveKind === 'secret' ? `/api/agents/${agent.id}/secrets` : `/api/agents/${agent.id}/user-secrets`;
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [NO_AUTO_COPY_HEADER]: '1' },
        body: JSON.stringify({ name: cleanName, ...(alsoCloud ? { value } : {}), storage: alsoCloud ? 'cloud' : 'device_only' }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; version?: number };
      if (!res.ok || data.ok === false) return setError(data.error ?? 'The cloud did not accept that.');
      if (effectiveKind === 'secret' && (hostList.length > 0 || importable)) {
        await supabase.from('secrets').update({ allowed_hosts: hostList.length > 0 ? hostList : null, agent_importable: importable }).eq('agent_id', agent.id).eq('name', cleanName);
      }
      await put({ agentId: agent.id, kind: effectiveKind, name: cleanName, value, version: typeof data.version === 'number' ? data.version : 1, deviceOnly: !alsoCloud, hosts: hostList });
      setName(''); setValue(''); setHosts(''); setImportable(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (agents.length === 0) return <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#9E9C8F' }}>You have no agents yet.</p>;
  return (
    <div style={{ marginTop: 14, background: '#fff', border: '1px solid #E2DFD3', borderRadius: 10, padding: '6px 18px 16px' }}>
      <label style={label}>Agent</label>
      <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={input}>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.owner ? '' : ' (connected)'}</option>)}
      </select>
      {agent?.owner ? (
        <>
          <label style={label}>What is it?</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'secret' | 'user_secret')} style={input}>
            <option value="secret">A secret of this agent (an API key it uses)</option>
          </select>
        </>
      ) : null}
      <label style={label}>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="STRIPE_KEY" style={input} autoComplete="off" spellCheck={false} />
      <label style={label}>Value</label>
      <input value={value} onChange={(e) => setValue(e.target.value)} type="password" placeholder="Stays on this PC; never shown again" style={input} autoComplete="off" />
      {effectiveKind === 'secret' ? (
        <>
          <label style={label}>Websites it may be sent to (optional, separate with commas)</label>
          <input value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="api.stripe.com" style={input} autoComplete="off" spellCheck={false} />
          <label style={{ ...label, display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0 0' }}>
            <input type="checkbox" checked={importable} onChange={(e) => setImportable(e.target.checked)} />
            Let the agent’s code use it through the broker (it can use it but never read it)
          </label>
        </>
      ) : null}
      <label style={{ ...label, display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0 0', lineHeight: 1.45 }}>
        <input type="checkbox" checked={alsoCloud} onChange={(e) => setAlsoCloud(e.target.checked)} style={{ marginTop: 2 }} />
        <span>
          Also save it in Parasync’s cloud, so the agent still works when this PC is off.
          {alsoCloud ? '' : ' Off: the value exists only on this PC. Tools that need it run only here, and fail with a clear message when this PC is off.'}
        </span>
      </label>
      {error ? <div style={{ marginTop: 12 }}><ErrorText>{error}</ErrorText></div> : null}
      <div style={{ marginTop: 14 }}><Button label="Save" loading={busy} onClick={() => { void save(); }} /></div>
    </div>
  );
}

function Entry({ r, result, verify, remove }: { r: VaultRow; result: ReturnType<typeof useVault>['results'][string] | undefined; verify: () => void; remove: () => void }) {
  const cloud = CLOUD[r.cloud];
  const check =
    result === 'checking' ? 'Checking…'
    : !result ? null
    : result.state === 'match' ? 'Matches the cloud'
    : result.state === 'differs' ? 'Different from the cloud’s'
    : result.state === 'pc-only' ? 'On this PC only: nothing to compare'
    : result.state === 'cloud-has-none' ? 'The cloud has none'
    : result.state === 'missing' ? 'Not on this PC anymore'
    : result.message;
  const checkTone = result && result !== 'checking' && (result.state === 'differs' || result.state === 'error' || result.state === 'cloud-has-none') ? '#B4442A' : '#3F6B4A';
  return (
    <div style={row}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.kind === 'browser_access' ? r.label : r.name} <span style={{ color: '#9E9C8F', fontWeight: 400 }}>· {KIND[r.kind]} · {r.agentName}</span></div>
        <div style={{ fontSize: 12, color: cloud.tone, marginTop: 2 }}>{cloud.text}{cloud.text ? ' · ' : ''}<span style={{ color: '#9E9C8F' }}>removed in {daysLeft(r.expiresAt)} days if unused</span></div>
        {check ? <div style={{ fontSize: 12, color: checkTone, marginTop: 2 }}>{check}</div> : null}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {!r.deviceOnly ? <Button variant="secondary" label="Check" onClick={verify} disabled={result === 'checking'} style={{ height: 30, padding: '0 12px' }} /> : null}
        <Button variant="secondary" label="Remove" onClick={remove} style={{ height: 30, padding: '0 12px' }} />
      </div>
    </div>
  );
}

export function LocalSecretsCard() {
  const v = useVault();
  const [adding, setAdding] = useState(false);
  const [keep, setKeep] = useState(true);

  useEffect(() => { void keepingCopies().then(setKeep); }, []);

  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ margin: '0 0 4px', fontFamily: "'Newsreader', Georgia, serif", fontSize: 21, fontWeight: 500 }}>Secrets on this PC</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9E9C8F', lineHeight: 1.5 }}>
        Keys and website logins kept here, encrypted by Windows for your account only. Tools that run on this PC use them without the cloud sending anything down.
        A secret nobody saves or uses for 30 days is removed from this PC. Nothing here can be read back, only checked or removed.
      </p>
      {v.available === false ? <ErrorText>Windows secure storage is not available on this PC, so secrets cannot be kept here.</ErrorText> : null}
      {v.rows.length > 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 10, overflow: 'hidden' }}>
          {v.rows.map((r, i) => (
            <div key={`${r.agentId}|${r.kind}|${r.name}`} style={i === v.rows.length - 1 ? { marginBottom: -1 } : undefined}>
              <Entry r={r} result={v.results[`${r.agentId}|${r.kind}|${r.name}`]} verify={() => { void v.verify(r); }} remove={() => { void v.remove(r); }} />
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: '#67655A' }}>{v.loading ? 'Loading…' : 'This PC holds no secrets yet.'}</p>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, fontSize: 12.5, color: '#67655A', lineHeight: 1.45 }}>
        <input type="checkbox" checked={keep} onChange={(e) => { setKeep(e.target.checked); void setKeepingCopies(e.target.checked); }} style={{ marginTop: 2 }} />
        <span>When I save a secret or website login in this app, also keep a copy on this PC.</span>
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Button variant="secondary" label={adding ? 'Close' : 'Add a secret to this PC'} onClick={() => setAdding((a) => !a)} disabled={v.available === false} />
        {v.rows.length > 0 ? <Button variant="secondary" label="Remove all from this PC" onClick={() => { if (window.confirm('Remove every secret this PC keeps for your account? The cloud copies are not touched.')) void v.wipe(); }} /> : null}
      </div>
      {adding ? <AddSecret put={v.put} onSaved={() => setAdding(false)} /> : null}
    </div>
  );
}
