// src/renderer/src/lib/auth.tsx
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { APP_CONFIG } from '@shared/config';

import { clearLocalData } from '@/lib/readState';
import { friendlyError, supabase } from '@/lib/supabase';

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  /** A message from the last sign-in attempt that came back from the browser (shown on the sign-in screen). */
  notice: string | null;
  clearNotice: () => void;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setSession(data.session);
        setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') clearLocalData();
      setSession(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // The system browser hands Google sign-in back as parasync://auth/callback?code=...
  useEffect(() => {
    return window.parasync.onAuthCallback((raw) => {
      void (async () => {
        try {
          const url = new URL(raw);
          const providerError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
          if (providerError) {
            setNotice(providerError);
            return;
          }
          const code = url.searchParams.get('code');
          if (!code) {
            setNotice('Sign-in did not return a code. Please try again.');
            return;
          }
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          setNotice(error ? friendlyError(error.message) : null);
        } catch {
          setNotice('Sign-in could not be completed. Please try again.');
        }
      })();
    });
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (/invalid login credentials/i.test(error.message)) return 'That email and password don’t match.';
    if (/email not confirmed/i.test(error.message)) return 'Confirm your email first (check your inbox), then sign in.';
    return friendlyError(error.message);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setNotice(null);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: APP_CONFIG.googleReturn === 'web-bridge' ? `${APP_CONFIG.webUrl}${APP_CONFIG.bridgePath}` : APP_CONFIG.authCallback, skipBrowserRedirect: true, queryParams: { access_type: 'offline', prompt: 'consent' } },
    });
    if (error || !data.url) return error?.message ?? 'Could not start Google sign-in.';
    try {
      await window.parasync.openOAuth(data.url);
      return null;
    } catch {
      return 'Could not open your browser for Google sign-in.';
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ session, loading, notice, clearNotice: () => setNotice(null), signInWithPassword, signInWithGoogle, signOut }),
    [session, loading, notice, signInWithPassword, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
