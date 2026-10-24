// src/renderer/src/views/AuthView.tsx
import { useState, type FormEvent } from 'react';

import { APP_CONFIG } from '@shared/config';

import { Button, ErrorText, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C, MONO, SERIF } from '@/lib/theme';
import logo from '@/assets/logo.png';

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6Z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1Z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48Z" />
    </svg>
  );
}

export function AuthView() {
  const { signInWithPassword, signInWithGoogle, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitingForBrowser, setWaitingForBrowser] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy('password'); setError(null); clearNotice();
    const err = await signInWithPassword(email, password);
    setBusy(null);
    if (err) setError(err);
  };

  const google = async () => {
    setBusy('google'); setError(null); clearNotice();
    const err = await signInWithGoogle();
    setBusy(null);
    if (err) setError(err);
    else setWaitingForBrowser(true);
  };

  const shownError = error ?? notice;
  const field = { height: 42, width: '100%', border: `1px solid ${C.lineStrong}`, borderRadius: 8, padding: '0 13px', fontSize: 14, color: C.ink, background: '#fff', outline: 'none' } as const;

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 24, overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <img src={logo} alt="" width={40} height={40} style={{ borderRadius: 11 }} draggable={false} />
          <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.015em', color: C.brassDeep }}>Parasync</span>
        </div>
        <h1 style={{ margin: '0 0 6px', fontFamily: SERIF, fontWeight: 500, fontSize: 32, letterSpacing: '-0.015em', color: C.ink }}>Welcome back.</h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: C.soft, lineHeight: 1.55 }}>Sign in to chat with your agents.</p>

        <button
          type="button" onClick={() => void google()} disabled={busy !== null} className="ps-press ps-hover"
          style={{ width: '100%', height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: `1px solid ${C.lineStrong}`, borderRadius: 8, background: '#fff', color: C.ink, fontSize: 14, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy && busy !== 'google' ? 0.55 : 1 }}
        >
          {busy === 'google' ? <Spinner size={16} /> : <GoogleMark />}
          Continue with Google
        </button>
        {waitingForBrowser && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>Finish signing in with Google in your browser. This window continues on its own.</p>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: C.faint, fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span style={{ flex: 1, height: 1, background: C.line }} />or<span style={{ flex: 1, height: 1, background: C.line }} />
        </div>

        <form onSubmit={(e) => void submit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: C.text }}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" spellCheck={false} style={field} autoFocus />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: C.text }}>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={field} />
          </label>
          {shownError && <ErrorText>{shownError}</ErrorText>}
          <Button type="submit" label="Sign in" loading={busy === 'password'} disabled={busy === 'google'} style={{ width: '100%', height: 42 }} />
        </form>

        <p style={{ margin: '22px 0 0', fontSize: 12.5, color: C.soft, lineHeight: 1.7 }}>
          New to Parasync?{' '}
          <a href={`${APP_CONFIG.webUrl}/auth?view=sign_up`} onClick={(e) => { e.preventDefault(); void window.parasync.openExternal(`${APP_CONFIG.webUrl}/auth?view=sign_up`); }} style={{ color: C.brass, cursor: 'pointer' }}>Create an account on the web</a>
          {' · '}
          <a href={`${APP_CONFIG.webUrl}/auth`} onClick={(e) => { e.preventDefault(); void window.parasync.openExternal(`${APP_CONFIG.webUrl}/auth`); }} style={{ color: C.brass, cursor: 'pointer' }}>Forgot password</a>
        </p>
      </div>
    </div>
  );
}
