// components/tool-builder/SecretsSection.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { Chip, Panel } from './ui';

interface AgentSecret { name: string; context: string | null }

const groupLabel = { fontFamily: MONO, fontSize: '0.62rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.5rem' } as const;

function SecretRow({ s, checked, onToggle, perUser }: { s: AgentSecret; checked: boolean; onToggle: () => void; perUser?: boolean }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} onClick={onToggle}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: "'Inter',sans-serif", padding: '0.55rem 0.7rem', borderRadius: 8, border: `1px solid ${checked ? C.brass : C.line}`, background: checked ? C.brassTint : '#fff' }}
    >
      <span aria-hidden style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, borderRadius: 5, display: 'grid', placeItems: 'center', border: `1.5px solid ${checked ? C.brass : '#C9C4B2'}`, background: checked ? C.brass : '#fff', color: '#fff' }}>
        {checked && <Icon name="check" size={11} strokeWidth={3} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 500, color: C.ink }}>{s.name}</span>
          {perUser && <Chip tone="brass">per user</Chip>}
        </span>
        {s.context && <span style={{ display: 'block', fontSize: '0.74rem', color: C.soft, marginTop: 2 }}>{s.context}</span>}
      </span>
    </button>
  );
}

export function SecretsSection({ agentId, selected, onToggle }: { agentId: string; selected: string[]; onToggle: (name: string) => void }) {
  const [secrets, setSecrets] = useState<AgentSecret[]>([]);
  const [userKeys, setUserKeys] = useState<AgentSecret[]>([]);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const [{ data: secretsData }, { data: userKeysData }] = await Promise.all([
        supabase.from('secrets').select('name, context').eq('agent_id', agentId).order('name', { ascending: true }),
        supabase.from('agent_user_secret_defs').select('name, context').eq('agent_id', agentId).order('name', { ascending: true }),
      ]);
      setSecrets((secretsData as AgentSecret[]) ?? []);
      setUserKeys((userKeysData as AgentSecret[]) ?? []);
    })();
  }, [agentId]);

  // A user-supplied key with the same name as an admin secret is shadowed at runtime (admin secrets resolve first), so listing both would be confusing.
  const visibleUserKeys = userKeys.filter(k => !secrets.some(s => s.name === k.name));

  return (
    <Panel
      icon="key-round" color={C.brassDeep} title="Secrets"
      description={<>Tick what your code needs. Each one is available as an environment variable, e.g. <code>os.environ[&quot;NAME&quot;]</code>. Fixed when you save, not chosen by the model. A per-user key resolves to whoever is chatting, so the same tool uses each person&apos;s own value.</>}
    >
      {secrets.length === 0 && visibleUserKeys.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0 }}>No secrets or per-user keys exist for this agent yet. Add some on the Secrets tab first.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {secrets.length > 0 && (
            <div>
              <p style={groupLabel}>Admin secrets</p>
              <div style={{ display: 'grid', gap: '0.4rem' }}>{secrets.map(s => <SecretRow key={s.name} s={s} checked={selected.includes(s.name)} onToggle={() => onToggle(s.name)} />)}</div>
            </div>
          )}
          {visibleUserKeys.length > 0 && (
            <div>
              <p style={groupLabel}>User-supplied keys</p>
              <div style={{ display: 'grid', gap: '0.4rem' }}>{visibleUserKeys.map(k => <SecretRow key={k.name} s={k} checked={selected.includes(k.name)} onToggle={() => onToggle(k.name)} perUser />)}</div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
