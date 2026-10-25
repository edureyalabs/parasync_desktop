// src/renderer/src/components/LocalSecretsCard.tsx
// Desktop-only overview on the About page: what this PC holds for the signed-in person, with remove. Secrets are ADDED where they live
// (the agent's Secrets tab, My Keys, a Browser Access site); this list only shows them, and nothing here can read a value back.
import { Button, ErrorText } from '~/components/ui';
import { useVault, type VaultRow } from '~/hooks/useVault';

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '11px 18px', borderBottom: '1px solid #E2DFD3', fontSize: 13.5 } as const;
const KIND: Record<string, string> = { secret: 'Agent secret', user_secret: 'My key', browser_access: 'Website login' };
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

function Entry({ r, remove }: { r: VaultRow; remove: () => void }) {
  return (
    <div style={row}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.kind === 'browser_access' ? r.label : r.name} <span style={{ color: '#9E9C8F', fontWeight: 400 }}>· {KIND[r.kind]} · {r.agentName}</span>
        </div>
        <div style={{ fontSize: 12, color: '#9E9C8F', marginTop: 2 }}>removed in {daysLeft(r.expiresAt)} days if unused</div>
      </div>
      <Button variant="secondary" label="Remove" onClick={remove} style={{ height: 30, padding: '0 12px', flexShrink: 0 }} />
    </div>
  );
}

export function LocalSecretsCard() {
  const v = useVault();
  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ margin: '0 0 4px', fontFamily: "'Newsreader', Georgia, serif", fontSize: 21, fontWeight: 500 }}>Kept on this PC</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9E9C8F', lineHeight: 1.5 }}>
        Keys and website logins you chose to keep here, encrypted by Windows for your account only. Runs on this PC use them first; otherwise the cloud copy is used.
        Add one from an agent’s Secrets tab, My Keys, or a Browser Access site. A copy nobody saves or uses for 30 days is removed. Nothing here can be read back.
      </p>
      {v.available === false ? <ErrorText>Windows secure storage is not available on this PC, so secrets cannot be kept here.</ErrorText> : null}
      {v.rows.length > 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 10, overflow: 'hidden' }}>
          {v.rows.map((r, i) => (
            <div key={`${r.agentId}|${r.kind}|${r.name}`} style={i === v.rows.length - 1 ? { marginBottom: -1 } : undefined}>
              <Entry r={r} remove={() => { void v.remove(r); }} />
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: '#67655A' }}>{v.loading ? 'Loading…' : 'This PC holds nothing yet.'}</p>
      )}
      {v.rows.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" label="Remove all from this PC" onClick={() => { if (window.confirm('Remove everything this PC keeps for your account? The cloud copies are not touched.')) void v.wipe(); }} />
        </div>
      ) : null}
    </div>
  );
}
