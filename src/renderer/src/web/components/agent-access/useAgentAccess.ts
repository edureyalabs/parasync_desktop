// components/agent-access/useAgentAccess.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Connection, Invite, NetworkSummary } from './types';

// An unambiguous alphabet (no 0/O, 1/I/L) so a code relayed by voice or chat survives being retyped.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode(): string {
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, n => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

const PAGE_SIZE = 20;
const EMPTY: NetworkSummary = { connections: [], total: 0, active: 0, paused: 0, totals: { calls: 0, cost: 0 }, windowDays: 30, truncated: false };

/**
 * Everything the Add Users tab needs: who is connected (paged, 20 at a time, with recent usage), the invites sent, and
 * the actions on them. The two loads are independent so the tab renders as soon as either arrives.
 */
export function useAgentAccess(agentId: string, invitesEnabled: boolean) {
  const [summary, setSummary] = useState<NetworkSummary>(EMPTY);
  const [hasMore, setHasMore] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(invitesEnabled);
  const [loadError, setLoadError] = useState('');

  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  // Which load is current, so a slow response for an old agent/reload can never overwrite a newer one.
  const generation = useRef(0);
  const loadedCount = useRef(0);
  const moreInFlight = useRef(false);

  useEffect(() => {
    if (!agentId) return;
    const counter = generation;
    const gen = ++counter.current;
    moreInFlight.current = false;
    (async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/network?limit=${PAGE_SIZE}&offset=0`);
        const data = await res.json();
        if (gen !== generation.current) return;
        if (data.ok) {
          loadedCount.current = data.connections.length;
          setSummary({ connections: data.connections, total: data.total, active: data.active, paused: data.paused, totals: data.totals, windowDays: data.windowDays, truncated: !!data.truncated });
          setHasMore(!!data.hasMore);
          setLoadError('');
        } else {
          setLoadError('Could not load the connected users.');
        }
      } catch {
        if (gen === generation.current) setLoadError('Could not load the connected users.');
      }
      if (gen === generation.current) setLoadingUsers(false);
    })();
    return () => { counter.current++; };
  }, [agentId, nonce]);

  useEffect(() => {
    if (!agentId || !invitesEnabled) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from('agent_invites').select('id, invited_email, code, status, created_at')
        .eq('agent_id', agentId).order('created_at', { ascending: false });
      if (cancelled) return;
      setInvites((data as Invite[] | null) ?? []);
      setLoadingInvites(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, invitesEnabled, nonce]);

  /** Next 20 people. Safe to call repeatedly (e.g. from a scroll observer): one request at a time. */
  const loadMore = useCallback(async () => {
    if (moreInFlight.current || !hasMore || !agentId) return;
    moreInFlight.current = true;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/network?limit=${PAGE_SIZE}&offset=${loadedCount.current}`);
      const data = await res.json();
      if (gen !== generation.current) return;
      if (data.ok) {
        loadedCount.current += data.connections.length;
        setSummary(prev => {
          const seen = new Set(prev.connections.map(c => c.id));
          return { ...prev, truncated: prev.truncated || !!data.truncated, connections: [...prev.connections, ...(data.connections as Connection[]).filter(c => !seen.has(c.id))] };
        });
        setHasMore(!!data.hasMore);
      } else {
        setHasMore(false);
        setLoadError('Could not load more users.');
      }
    } catch {
      if (gen === generation.current) { setHasMore(false); setLoadError('Could not load more users.'); }
    } finally {
      if (gen === generation.current) { moreInFlight.current = false; setLoadingMore(false); }
    }
  }, [agentId, hasMore]);

  /** Pause or resume one user. Returns an error message, or null. */
  const setStatus = async (conn: Connection, next: 'active' | 'paused'): Promise<string | null> => {
    const { error } = await createClient().from('agent_network').update({ status: next }).eq('id', conn.id);
    if (error) return 'Could not update this user. Please try again.';
    setSummary(prev => ({
      ...prev,
      active: prev.active + (next === 'active' ? 1 : -1),
      paused: prev.paused + (next === 'paused' ? 1 : -1),
      connections: prev.connections.map(c => (c.id === conn.id ? { ...c, status: next } : c)),
    }));
    return null;
  };

  /** Sends an invite; resolves with the code to hand over (it is never shown to the recipient on the platform). */
  const sendInvite = async (rawEmail: string): Promise<{ code: string; email: string } | { error: string }> => {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
    if (invites.some(i => i.status === 'pending' && i.invited_email.toLowerCase() === email)) {
      return { error: 'There is already a pending invite for this address. Copy its code from the Invites list, or cancel it first.' };
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const code = generateCode();
    const { data, error } = await supabase
      .from('agent_invites').insert({ agent_id: agentId, invited_email: email, code, created_by: user?.id })
      .select('id, invited_email, code, status, created_at').single();
    if (error || !data) return { error: 'Something went wrong. Please try again.' };
    setInvites(prev => [data as Invite, ...prev]);
    return { code, email };
  };

  const cancelInvite = async (invite: Invite): Promise<string | null> => {
    const { error } = await createClient().from('agent_invites').update({ status: 'revoked' }).eq('id', invite.id);
    if (error) return 'Could not cancel this invite. Please try again.';
    setInvites(prev => prev.map(i => (i.id === invite.id ? { ...i, status: 'revoked' } : i)));
    return null;
  };

  return { summary, invites, loadingUsers, loadingInvites, loadingMore, hasMore, loadMore, loadError, reload, setStatus, sendInvite, cancelInvite };
}
