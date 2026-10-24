// app/(shell)/account/profile/ProfileView.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AccountPage, Btn, Card, CardTitle, Chip, Spinner } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtAmount, fmtDate, initials } from '@/components/account/format';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string | null;
  avatar: string | null;
  created_at: string;
}

export interface Glance {
  organizations: number;
  agentsOwned: number;
  agentsConnected: number;
  balance: number;
}

const MAX_ORGS = 2;

function providerLabel(provider: string | undefined): string {
  if (provider === 'google') return 'Google';
  if (provider === 'email' || !provider) return 'Email and password';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function GlanceTile({ href, label, value, sub, tone }: { href: string; label: string; value: React.ReactNode; sub: string; tone?: string }) {
  return (
    <Link href={href} className="ac-card-hover" style={{ display: 'block', textDecoration: 'none', background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '1rem 1.1rem', minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.45rem' }}>{label}</p>
      <p style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.025em', color: tone ?? C.ink, margin: 0, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: '0.72rem', color: C.soft, margin: '0.4rem 0 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>{sub} <span aria-hidden="true" style={{ color: C.faint }}>{'→'}</span></p>
    </Link>
  );
}

function MetaRow({ label, children, first = false }: { label: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', padding: '0.6rem 0', borderTop: first ? 'none' : `1px solid ${C.lineSoft}` }}>
      <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.8rem', color: C.ink, textAlign: 'right', minWidth: 0 }}>{children}</span>
    </div>
  );
}


/** The Profile tab's body. The page loads the account and supplies the three actions; the form state lives here. */
export function ProfileView({ email, userId, provider, lastSignIn, profile, glance, onSaveName, onSignOut, onSendReset }: {
  email: string;
  userId: string;
  provider: string | undefined;
  lastSignIn: string | null;
  profile: Profile | null;
  glance: Glance | null;
  onSaveName: (name: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onSendReset: () => Promise<boolean>;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [savedName, setSavedName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reset, setReset] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    const ok = await onSaveName(name.trim());
    setSaving(false);
    if (!ok) { setError('Failed to save. Please try again.'); return; }
    setSavedName(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await onSignOut();
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be unavailable (insecure context); the id is selectable on screen anyway.
    }
  };

  const sendReset = async () => {
    setReset('sending');
    setReset((await onSendReset()) ? 'sent' : 'error');
  };

  const displayName = savedName || email;
  const dirty = name.trim() !== savedName;
  const lowBalance = (glance?.balance ?? 0) < 1;

  return (
    <AccountPage eyebrow="Profile" title="Your account" maxWidth={1100}>
      <style>{`
        .pf-grid { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 1.25rem; align-items: start; }
        @media (max-width: 920px) { .pf-grid { grid-template-columns: minmax(0, 1fr); } }
        .p-field { width: 100%; padding: 0.6rem 0.75rem; font-size: 0.875rem; font-family: 'Inter', sans-serif; color: #26251E; background: #fff; border: 1px solid #DAD5C5; border-radius: 6px; outline: none; transition: border-color 0.15s, box-shadow 0.15s; box-sizing: border-box; }
        .p-field:focus { border-color: #26251E; box-shadow: 0 0 0 3px rgba(161,127,58,0.18); }
        .p-field:disabled { background: #F1EFE6; color: #9E9C8F; cursor: not-allowed; }
      `}</style>

      <div className="pf-grid">
        {/* Identity */}
        <Card pad="0" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '1.75rem 1.5rem 1.4rem', textAlign: 'center', background: `linear-gradient(180deg, ${C.brassTint} 0%, #FFFFFF 100%)`, borderBottom: `1px solid ${C.line}` }}>
            {profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote OAuth avatar URL, no static import list to feed next/image
              <img src={profile.avatar} alt="" width={88} height={88} style={{ borderRadius: '50%', objectFit: 'cover', boxShadow: `0 0 0 4px ${C.brassWash}` }} />
            ) : (
              <div style={{ width: 88, height: 88, borderRadius: '50%', background: C.ink, color: '#F7F6F2', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '1.5rem', boxShadow: `0 0 0 4px ${C.brassWash}` }}>
                {initials(displayName || 'U')}
              </div>
            )}
            <p style={{ fontSize: '1.1rem', fontWeight: 500, letterSpacing: '-0.02em', color: C.ink, margin: '1rem 0 0.15rem', overflowWrap: 'anywhere' }}>{displayName}</p>
            <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0, overflowWrap: 'anywhere' }}>{email}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
              <Chip tone="brass">{providerLabel(provider)}</Chip>
              {profile?.created_at && <Chip tone="neutral">Since {fmtDate(profile.created_at)}</Chip>}
            </div>
          </div>
          <div style={{ padding: '0.4rem 1.5rem 1.4rem' }}>
            <MetaRow label="Last sign-in" first>{lastSignIn ? fmtDate(lastSignIn) : '—'}</MetaRow>
            <MetaRow label="Account ID">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', maxWidth: '100%' }}>
                <span title={userId} style={{ fontFamily: MONO, fontSize: '0.68rem', color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{userId}</span>
                <Btn size="sm" variant="outline" onClick={copyId} style={{ padding: '0.15rem 0.5rem', fontSize: '0.66rem' }}>{copied ? 'Copied' : 'Copy'}</Btn>
              </span>
            </MetaRow>
            <Btn variant="outline" onClick={handleSignOut} disabled={signingOut} style={{ width: '100%', marginTop: '0.9rem' }}>
              {signingOut && <Spinner size={13} />}
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Btn>
          </div>
        </Card>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          {/* At a glance */}
          {glance && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem' }}>
              <GlanceTile href="/account/organizations" label="Organizations" value={<>{glance.organizations}<span style={{ color: C.faint, fontSize: '1rem' }}> / {MAX_ORGS}</span></>} sub="Manage workspaces" />
              <GlanceTile href="/agents" label="Agents you own" value={glance.agentsOwned} sub={`${glance.agentsConnected} connected to`} />
              <GlanceTile href="/account/billing" label="Balance" value={`$${fmtAmount(glance.balance)}`} sub={lowBalance ? 'Add funds' : 'View billing'} tone={glance.balance <= 0 ? C.red : lowBalance ? C.amber : undefined} />
            </div>
          )}

          {/* Personal details */}
          <Card pad="1.4rem 1.5rem 1.5rem">
            <CardTitle>Personal details</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.1rem 1.25rem' }}>
              <div>
                <label htmlFor="pf-name" style={{ display: 'block', fontFamily: MONO, fontSize: '0.62rem', color: C.body, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.45rem' }}>Display name</label>
                <input
                  id="pf-name" className="p-field" type="text" placeholder="Your name" value={name} maxLength={80}
                  onChange={e => { setName(e.target.value); setError(''); setSaved(false); }}
                  onKeyDown={e => { if (e.key === 'Enter' && dirty && !saving) handleSave(); }}
                />
                <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.4rem 0 0' }}>Shown to people you share agents with.</p>
              </div>
              <div>
                <label htmlFor="pf-email" style={{ display: 'block', fontFamily: MONO, fontSize: '0.62rem', color: C.body, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.45rem' }}>Email</label>
                <input id="pf-email" className="p-field" type="email" value={email} disabled />
                <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.4rem 0 0' }}>Managed by your sign-in provider.</p>
              </div>
            </div>

            {error && (
              <p role="alert" style={{ fontSize: '0.78rem', color: C.red, background: C.redWash, border: `1px solid ${C.redLine}`, borderRadius: 6, padding: '0.45rem 0.75rem', margin: '1rem 0 0' }}>{error}</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginTop: '1.25rem' }}>
              <Btn variant="primary" onClick={handleSave} disabled={saving || !dirty}>
                {saving && <Spinner size={13} color="#fff" />}
                {saving ? 'Saving…' : 'Save changes'}
              </Btn>
              {saved && <span role="status" style={{ fontSize: '0.78rem', color: C.green, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />Saved</span>}
            </div>
          </Card>

          {/* Sign-in & security */}
          <Card pad="1.4rem 1.5rem">
            <CardTitle>Sign-in &amp; security</CardTitle>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.86rem', fontWeight: 500, color: C.ink, margin: '0 0 0.25rem' }}>Signed in with {providerLabel(provider)}</p>
                <p style={{ fontSize: '0.78rem', color: C.soft, margin: 0, lineHeight: 1.55, maxWidth: 440 }}>
                  {provider === 'google'
                    ? 'Your password and two-step verification are managed in your Google account.'
                    : 'We can email you a link to choose a new password.'}
                </p>
              </div>
              {provider !== 'google' && (
                reset === 'sent'
                  ? <Chip tone="green" dot>Link sent to {email}</Chip>
                  : <Btn variant="outline" onClick={sendReset} disabled={reset === 'sending' || !email}>
                      {reset === 'sending' && <Spinner size={13} />}
                      {reset === 'sending' ? 'Sending…' : reset === 'error' ? 'Try again' : 'Send password reset link'}
                    </Btn>
              )}
            </div>
            {reset === 'error' && <p role="alert" style={{ fontSize: '0.76rem', color: C.red, margin: '0.8rem 0 0' }}>We couldn&apos;t send the email. Please try again in a moment.</p>}
          </Card>
        </div>
      </div>
    </AccountPage>
  );
}
