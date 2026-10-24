// src/renderer/src/views/account/ProfilePage.tsx
import { useState } from 'react';

import { Avatar, Button, ErrorText } from '@/components/ui';
import { Fact, Loaded, Panel, TabPage, WebNote, shortDate } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/lib/auth';
import { fmtUsd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

interface ProfileData { name: string | null; avatar: string | null; created_at: string | null; orgs: number; agents: number; connected: number; balance: number | null }

export function ProfilePage() {
  const { session } = useAuth();
  const user = session?.user;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = useAsync<ProfileData>(async () => {
    if (!user) throw new Error('You are signed out.');
    const [profile, orgs, connected, wallet] = await Promise.all([
      supabase.from('profiles').select('name, avatar, created_at').eq('id', user.id).maybeSingle(),
      supabase.from('organizations').select('id').eq('owner_id', user.id),
      supabase.from('agent_network').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
      supabase.from('wallets').select('balance_credits').eq('user_id', user.id).maybeSingle(),
    ]);
    const orgIds = ((orgs.data ?? []) as { id: string }[]).map((o) => o.id);
    let agents = 0;
    if (orgIds.length > 0) agents = (await supabase.from('agents').select('id', { count: 'exact', head: true }).in('org_id', orgIds)).count ?? 0;
    const p = profile.data as { name: string | null; avatar: string | null; created_at: string | null } | null;
    return { name: p?.name ?? null, avatar: p?.avatar ?? null, created_at: p?.created_at ?? user.created_at ?? null, orgs: orgIds.length, agents, connected: connected.count ?? 0, balance: wallet.error ? null : wallet.data ? Number((wallet.data as { balance_credits: number }).balance_credits) : 0 };
  }, [user?.id]);

  const save = async () => {
    const next = name.trim();
    if (!user || !next) { setError('Enter your name.'); return; }
    setSaving(true); setError(null);
    const { error: err } = await supabase.from('profiles').update({ name: next }).eq('id', user.id);
    setSaving(false);
    if (err) { setError('Your name could not be saved. Please try again.'); return; }
    setEditing(false);
    state.reload();
  };

  return (
    <TabPage title="Profile" subtitle="You, and a summary of what is on your account.">
      <Loaded state={state}>
        {(p) => (
          <>
            <Panel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 20 }}>
                <Avatar name={p.name || user?.email || 'You'} url={p.avatar} size={64} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 24, fontWeight: 500 }}>{p.name || 'Add your name'}</div>
                  <div style={{ fontSize: 13, color: C.soft }}>{user?.email}</div>
                </div>
              </div>
            </Panel>
            <Panel title="Details">
              {editing ? (
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus aria-label="Your name" onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
                    style={{ height: 40, border: `1px solid ${C.lineStrong}`, borderRadius: 8, padding: '0 12px', fontSize: 14, color: C.ink, outline: 'none', background: '#fff' }}
                  />
                  {error && <ErrorText>{error}</ErrorText>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button label="Save" loading={saving} onClick={() => void save()} />
                    <Button variant="ghost" label="Cancel" onClick={() => { setEditing(false); setError(null); }} />
                  </div>
                </div>
              ) : (
                <Fact label="Name" value={<span>{p.name || '—'} <button onClick={() => { setName(p.name ?? ''); setEditing(true); }} style={{ marginLeft: 10, border: 'none', background: 'none', color: C.brass, cursor: 'pointer', fontSize: 13 }}>Edit</button></span>} />
              )}
              <Fact label="Email" value={user?.email ?? '—'} />
              <Fact label="Joined" value={shortDate(p.created_at)} last />
            </Panel>
            <Panel title="Your account">
              <Fact label="Organizations you own" value={p.orgs} />
              <Fact label="Agents you built" value={p.agents} />
              <Fact label="Agents you are connected to" value={p.connected} />
              <Fact label="Wallet balance" value={p.balance === null ? '—' : fmtUsd(p.balance)} last />
            </Panel>
          </>
        )}
      </Loaded>
      <WebNote path="/account/profile">Changing your photo and password is done in the web app.</WebNote>
    </TabPage>
  );
}
