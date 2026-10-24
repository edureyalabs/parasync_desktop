// src/renderer/src/views/AccountView.tsx
import { useEffect, useState, type ReactNode } from 'react';

import { APP_CONFIG } from '@shared/config';

import { Icon, type IconName } from '@/components/Icon';
import { Button, Card, Chip, PageHeader, Spinner } from '@/components/ui';
import { useUpdates } from '@/hooks/useUpdates';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtUsd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { C, MONO } from '@/lib/theme';

interface OrgRow { id: string; name: string; created_at: string }

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <Card style={{ maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Icon name={icon} size={17} color={C.brass} />
        <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.muted }}>{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', fontSize: 13.5 }}>
      <span style={{ color: C.soft }}>{label}</span>
      <span style={{ color: C.ink, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}

function openWeb(path: string): void {
  void window.parasync.openExternal(`${APP_CONFIG.webUrl}${path}`).catch(() => undefined);
}

export function AccountView() {
  const { session, signOut } = useAuth();
  const user = session?.user;
  const { status, info, check, install } = useUpdates();
  const [name, setName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const [profile, wallet, organizations] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(),
        supabase.from('wallets').select('balance_credits').eq('user_id', user.id).maybeSingle(),
        supabase.from('organizations').select('id, name, created_at').eq('owner_id', user.id).order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      setName((profile.data?.name as string | null | undefined) ?? null);
      setBalance(wallet.error ? null : wallet.data ? Number(wallet.data.balance_credits) : 0); // 1 credit = $1
      setOrgs(organizations.error ? [] : ((organizations.data as OrgRow[]) ?? []));
    })();
    return () => { cancelled = true; };
  }, [user]);

  const updateLine =
    status.state === 'checking' ? 'Checking…'
    : status.state === 'available' ? `Version ${status.version} found, downloading…`
    : status.state === 'downloading' ? `Downloading ${status.percent}%`
    : status.state === 'ready' ? `Version ${status.version} is ready`
    : status.state === 'error' ? 'Could not check for updates'
    : status.state === 'unsupported' ? 'Only the installed app checks for updates'
    : 'You’re up to date';

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
      <PageHeader title="Account" subtitle={user?.email ?? ''} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section icon="user" title="Profile">
          <Line label="Name" value={name ?? '—'} />
          <Line label="Email" value={user?.email ?? '—'} />
          <div style={{ marginTop: 10 }}><Button variant="secondary" icon="external" label="Edit profile on the web" onClick={() => openWeb('/account')} /></div>
        </Section>

        <Section icon="wallet" title="Wallet">
          {balance === undefined ? <Spinner size={18} /> : balance === null ? (
            <p style={{ margin: 0, fontSize: 13, color: C.soft }}>Your balance could not be loaded.</p>
          ) : (
            <Line label="Balance" value={<strong style={{ fontSize: 18, fontWeight: 600 }}>{fmtUsd(balance)}</strong>} />
          )}
          <div style={{ marginTop: 10 }}><Button variant="secondary" icon="external" label="Billing and top-ups on the web" onClick={() => openWeb('/account/billing')} /></div>
        </Section>

        <Section icon="building" title="Organizations">
          {orgs === null ? <Spinner size={18} /> : orgs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: C.soft }}>You don’t own an organization. Agents you’re connected to appear under My Agents.</p>
          ) : (
            orgs.map((o) => <Line key={o.id} label={o.name} value={`Created ${fmtDate(o.created_at)}`} />)
          )}
          <div style={{ marginTop: 10 }}><Button variant="secondary" icon="external" label="Manage organizations and agents on the web" onClick={() => openWeb('/account/organizations')} /></div>
        </Section>

        <Section icon="info" title="This app">
          <Line label="Version" value={info?.version ?? '—'} />
          <Line label="Updates" value={updateLine} />
          <Line label="Sign-in storage" value={info ? (info.secureStorage ? <Chip label="Encrypted by Windows" tone="green" /> : <Chip label="Memory only" tone="brass" title="Windows encryption isn't available, so you'll sign in again each time" />) : '—'} />
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            {status.state === 'ready'
              ? <Button label="Restart to update" onClick={install} />
              : <Button variant="secondary" icon="refresh" label="Check for updates" onClick={check} loading={status.state === 'checking'} disabled={status.state === 'downloading'} />}
          </div>
        </Section>

        <div style={{ maxWidth: 620 }}>
          <Button variant="danger" icon="logout" label="Sign out" loading={signingOut} onClick={() => { setSigningOut(true); void signOut(); }} />
        </div>
      </div>
    </div>
  );
}
