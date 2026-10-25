// src/renderer/src/shims/localCopy.tsx
// The desktop's answer to the web's `components/local-copy/LocalCopy.tsx`: the controls for keeping a secret or a website login on THIS PC.
// On the web those three components render nothing. Here:
//   LocalSaveChoice   inside a save dialog: "save in the cloud" / "keep on this PC" (acted on by shims/apiBridge.ts)
//   LocalCopyRow      under an existing secret or login: does this PC hold its own copy? Add, replace or remove it.
//   DesktopNavFooter  room under Sign out for the version label
//   DesktopAccountLinks   an "About this app" entry in the Account menu.
// The cloud's copy and this PC's copy are kept separately by the person and never compared or moved. The page can add and remove a copy
// here but can never read one back (values go straight to the main process; see src/shared/vault.ts).
import { useEffect, useState } from 'react';

import type { SecretKind } from '@shared/vault';

import { announceVaultChanged, onVaultChanged, setSaveChoice } from '~/lib/localCopy';
import { usePathname, useRouter } from '~/shims/nextNavigation';

interface LoginField { key: string; label: string; kind?: string; secret?: boolean; options?: string[] }

const INK = '#26251E';
const SOFT = '#67655A';
const GREEN = '#3C7E6A';
const FONT = "'Inter', sans-serif";

/** Names held on this PC for the signed-in person (never values). Re-reads whenever a copy is added or removed. */
function useHeld(): { available: boolean | null; has: (kind: SecretKind, agentId: string, name: string) => boolean } {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [held, setHeld] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [info, list] = await Promise.all([window.parasync.vault.info(), window.parasync.vault.list()]);
        if (cancelled) return;
        setAvailable(info.available);
        setHeld(new Set(list.map((e) => `${e.agentId}|${e.kind}|${e.name}`)));
      } catch {
        if (!cancelled) setAvailable(false);
      }
    };
    void load();
    const off = onVaultChanged(() => { void load(); });
    return () => { cancelled = true; off(); };
  }, []);
  return { available, has: (kind, agentId, name) => held.has(`${agentId.toLowerCase()}|${kind}|${kind === 'browser_access' ? name.toLowerCase() : name}`) };
}

// ─── inside a save dialog ────────────────────────────────────────────────────────────

export function LocalSaveChoice({ kind, agentId }: { kind: SecretKind; agentId: string }) {
  const { available } = useHeld();
  const [cloud, setCloud] = useState(true);
  const [pc, setPc] = useState(true);
  const canChooseCloud = kind !== 'browser_access';
  // Keeping it off the cloud only makes sense when it is kept here instead.
  const effectiveCloud = canChooseCloud ? cloud || !pc : true;

  useEffect(() => {
    if (available === false) { setSaveChoice(null); return; }
    setSaveChoice({ cloud: effectiveCloud, pc: available === true && pc });
    return () => setSaveChoice(null);
  }, [available, effectiveCloud, pc]);
  void agentId;

  if (available !== true) return null;
  const box = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: INK, lineHeight: 1.45, fontFamily: FONT, cursor: 'pointer' } as const;
  return (
    <div style={{ margin: '0.9rem 0 0', padding: '0.7rem 0.8rem', background: '#F7F6F2', border: '1px solid #E2DFD3', borderRadius: 8, display: 'grid', gap: 8 }}>
      <label style={box}>
        <input type="checkbox" checked={effectiveCloud} disabled={!canChooseCloud || !pc} onChange={(e) => setCloud(e.target.checked)} style={{ marginTop: 2 }} />
        <span>Save in Parasync’s cloud <span style={{ color: SOFT }}>— so the agent still works when this PC is off{canChooseCloud ? '' : ' (always, for a website login)'}</span></span>
      </label>
      <label style={box}>
        <input type="checkbox" checked={pc} onChange={(e) => setPc(e.target.checked)} style={{ marginTop: 2 }} />
        <span>Keep a copy on this PC <span style={{ color: SOFT }}>— runs on this PC use it first. It is never sent anywhere, and is not linked to the cloud copy.</span></span>
      </label>
      {kind === 'browser_access' && pc ? <span style={{ fontSize: 11.5, color: SOFT }}>To keep a copy here, fill in every field (a blank field keeps the cloud’s old value, which this PC would not have).</span> : null}
    </div>
  );
}

// ─── under an existing secret or login ───────────────────────────────────────────────

function LocalValueModal({ kind, agentId, name, label, fields, replacing, onClose }: {
  kind: SecretKind; agentId: string; name: string; label?: string; fields?: LoginField[]; replacing: boolean; onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = kind === 'browser_access';

  async function save() {
    setError('');
    let payload = value;
    if (login) {
      const kept: Record<string, string> = {};
      for (const f of fields ?? []) {
        const v = (values[f.key] ?? '').trim();
        if (v) kept[f.key] = v;
        else if (f.kind !== 'checkbox') return setError(`Fill in “${f.label}”. A copy kept here needs every field.`);
      }
      payload = JSON.stringify(kept);
    } else if (!value) {
      return setError('Enter the value.');
    }
    setBusy(true);
    try {
      await window.parasync.vault.put({ agentId, kind, name, value: payload, version: 0, deviceOnly: false });
      announceVaultChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not keep that on this PC.');
    } finally {
      setBusy(false);
    }
  }

  const input = { width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem', fontSize: '0.875rem', fontFamily: FONT, color: INK, background: '#fff', border: '1px solid #DAD5C5', borderRadius: 4, outline: 'none' } as const;
  const lab = { display: 'block', fontSize: 12, color: SOFT, margin: '0.8rem 0 0.3rem', fontFamily: FONT } as const;
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '1.6rem', width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <p style={{ margin: '0 0 0.2rem', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{replacing ? 'Replace the copy on this PC' : 'Add for this PC'}</p>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 500, color: INK, fontFamily: login ? FONT : "'IBM Plex Mono', monospace" }}>{login ? (label || 'Website login') : name}</h2>
        <p style={{ margin: '0.6rem 0 0', fontSize: 12.5, color: SOFT, lineHeight: 1.5, fontFamily: FONT }}>
          Type it again here. It is encrypted by Windows for your account only, stays on this PC, and is not checked against the cloud’s copy.
        </p>
        {login ? (fields ?? []).map((f) => (
          <div key={f.key}>
            {f.kind === 'checkbox' ? (
              <label style={{ ...lab, display: 'flex', gap: 8, alignItems: 'center', color: INK }}>
                <input type="checkbox" checked={values[f.key] === 'true'} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked ? 'true' : 'false' }))} />{f.label}
              </label>
            ) : (
              <>
                <label style={lab}>{f.label}</label>
                {f.kind === 'select' ? (
                  <select value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} style={input}>
                    <option value="">Choose…</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.kind === 'password' || f.secret ? 'password' : 'text'} autoComplete="off" value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} style={input} />
                )}
              </>
            )}
          </div>
        )) : (
          <>
            <label style={lab}>Value</label>
            <input type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} style={input} autoFocus />
          </>
        )}
        {error ? <p style={{ margin: '0.9rem 0 0', fontSize: 12.5, color: '#B34A3C', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p> : null}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.4rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.5rem 1rem', fontSize: '0.8rem', fontFamily: FONT, cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
          <button onClick={() => { void save(); }} disabled={busy} style={{ background: INK, color: '#F7F6F2', border: 'none', padding: '0.5rem 1.15rem', fontSize: '0.8rem', fontFamily: FONT, cursor: busy ? 'default' : 'pointer', borderRadius: 4, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Keep on this PC'}</button>
        </div>
      </div>
    </div>
  );
}

export function LocalCopyRow({ kind, agentId, name, label, fields }: { kind: SecretKind; agentId: string; name: string; label?: string; fields?: LoginField[] }) {
  const { available, has } = useHeld();
  const [open, setOpen] = useState(false);
  if (available !== true) return null;
  const here = has(kind, agentId, name);
  const link = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontFamily: FONT, color: INK, textDecoration: 'underline' } as const;

  async function remove() {
    if (!window.confirm('Remove the copy kept on this PC? The cloud copy is not touched.')) return;
    try {
      await window.parasync.vault.remove({ agentId: agentId.toLowerCase(), kind, name: kind === 'browser_access' ? name.toLowerCase() : name });
      announceVaultChanged();
    } catch { /* the row refreshes on the next change */ }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: '0.55rem', fontSize: 12, fontFamily: FONT, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: here ? GREEN : SOFT }}>
        <span aria-hidden style={{ fontSize: 13 }}>{here ? '✓' : '○'}</span>
        {here ? 'Copy kept on this PC — runs here use it first' : 'No copy on this PC — runs use the cloud copy'}
      </span>
      <button style={link} onClick={() => setOpen(true)}>{here ? 'Replace' : 'Add for this PC'}</button>
      {here ? <button style={{ ...link, color: '#B34A3C' }} onClick={() => { void remove(); }}>Remove</button> : null}
      {open ? <LocalValueModal kind={kind} agentId={agentId.toLowerCase()} name={kind === 'browser_access' ? name.toLowerCase() : name} label={label} fields={fields} replacing={here} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

// ─── left strip ──────────────────────────────────────────────────────────────────────

/** Room under Sign out for the version label (components/VersionTag.tsx), so the two are well apart. */
export function DesktopNavFooter() {
  return <div aria-hidden style={{ height: 40, flexShrink: 0 }} />;
}

// ─── Account menu ────────────────────────────────────────────────────────────────────

export function DesktopAccountLinks() {
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname === '/desktop';
  return (
    <button
      onClick={() => router.push('/desktop')}
      style={{ textAlign: 'left', width: '100%', display: 'block', padding: '0.55rem 0.65rem', fontSize: '0.85rem', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: FONT, background: active ? INK : 'transparent', color: active ? '#F7F6F2' : '#3A3830', fontWeight: active ? 500 : 400 }}
    >
      About this app
    </button>
  );
}
