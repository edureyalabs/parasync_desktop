// src/renderer/src/hooks/useNotifications.ts
// The per-agent notification feed for the signed-in user: the newest page, older pages on demand (keyset
// pagination), a live unread count and realtime inserts. Rows are written only by the backend; row-level security
// limits what this client can read to the caller's own rows.
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase, topic } from '@/lib/supabase';
import type { MessageAttachment } from '@/lib/types';

export const PAGE_SIZE = 10;

export interface AgentNotification {
  id: string;
  agent_id: string;
  user_id: string;
  task_id: string | null;
  run_id: string | null;
  kind: string;
  task_label: string;
  /** Markdown. */
  body: string;
  attachments: MessageAttachment[] | null;
  created_at: string;
  read_at: string | null;
  project_id?: string | null;
  reply_text?: string | null;
  replied_at?: string | null;
}

export interface NotificationsState {
  items: AgentNotification[];
  unread: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Entries that were unread when the feed was last opened, highlighted while it stays open. */
  freshIds: ReadonlySet<string>;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
  acknowledge: () => Promise<void>;
  clearFresh: () => void;
}

function newestFirst(a: AgentNotification, b: AgentNotification): number {
  const byTime = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (byTime) return byTime;
  return a.id < b.id ? 1 : -1;
}

function mergeById(existing: AgentNotification[], incoming: AgentNotification[]): AgentNotification[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return [...byId.values()].sort(newestFirst);
}

export function useNotifications(agentId: string | null): NotificationsState {
  const userIdRef = useRef<string | null>(null);
  const generationRef = useRef(0); // a slow response from an earlier load must never overwrite a newer one

  const [items, setItems] = useState<AgentNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());

  const itemsRef = useRef(items);
  const unreadRef = useRef(unread);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(false);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { unreadRef.current = unread; }, [unread]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const resolveUserId = useCallback(async (): Promise<string | null> => {
    if (userIdRef.current) return userIdRef.current;
    const { data: { session } } = await supabase.auth.getSession();
    userIdRef.current = session?.user.id ?? null;
    return userIdRef.current;
  }, []);

  const loadHead = useCallback(async (replace: boolean) => {
    if (!agentId) return;
    const generation = ++generationRef.current;
    const userId = await resolveUserId();
    if (!userId) { setLoading(false); return; }

    const [page, count] = await Promise.all([
      supabase.from('agent_notifications').select('*')
        .eq('agent_id', agentId).eq('user_id', userId)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .limit(PAGE_SIZE + 1),
      supabase.from('agent_notifications').select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId).eq('user_id', userId).is('read_at', null),
    ]);
    if (generation !== generationRef.current) return;

    if (page.error) {
      setError('Could not load notifications.');
      setLoading(false);
      return;
    }
    const rows = (page.data ?? []) as AgentNotification[];
    setError(null);
    if (replace) {
      setItems(rows.slice(0, PAGE_SIZE));
      setHasMore(rows.length > PAGE_SIZE);
    } else {
      setItems((prev) => mergeById(prev, rows.slice(0, PAGE_SIZE)));
    }
    if (!count.error) setUnread(count.count ?? 0);
    setLoading(false);
  }, [agentId, resolveUserId]);

  const reload = useCallback(async () => {
    setLoading(true);
    await loadHead(true);
  }, [loadHead]);

  const loadMore = useCallback(async () => {
    if (!agentId || loadingMoreRef.current || !hasMoreRef.current) return;
    const last = itemsRef.current[itemsRef.current.length - 1];
    const userId = userIdRef.current;
    if (!last || !userId) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const generation = generationRef.current;
    try {
      const { data, error: pageError } = await supabase
        .from('agent_notifications').select('*')
        .eq('agent_id', agentId).eq('user_id', userId)
        .or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (generation !== generationRef.current) return;
      if (pageError) { setError('Could not load older notifications.'); return; }
      const rows = (data ?? []) as AgentNotification[];
      setError(null);
      setItems((prev) => mergeById(prev, rows.slice(0, PAGE_SIZE)));
      setHasMore(rows.length > PAGE_SIZE);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [agentId]);

  /** Marks everything read (the badge clears) and remembers which entries were new. */
  const acknowledge = useCallback(async () => {
    const userId = userIdRef.current;
    if (!agentId || !userId) return;
    const newIds = itemsRef.current.filter((n) => !n.read_at).map((n) => n.id);
    if (newIds.length === 0 && unreadRef.current === 0) return;

    const nowIso = new Date().toISOString();
    if (newIds.length) setFreshIds((prev) => new Set([...prev, ...newIds]));
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
    setUnread(0);

    // Best effort: a failed write only means the entries show as unread again on the next full load.
    const { error: updateError } = await supabase
      .from('agent_notifications').update({ read_at: nowIso })
      .eq('agent_id', agentId).eq('user_id', userId).is('read_at', null);
    if (updateError) console.warn('Could not mark notifications read:', updateError.message);
  }, [agentId]);

  const clearFresh = useCallback(() => setFreshIds(new Set()), []);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    let subscribedBefore = false;
    setItems([]); setUnread(0); setHasMore(false); setFreshIds(new Set()); setError(null); setLoading(true);

    void loadHead(true);

    const channel = supabase
      .channel(topic(`agent-notifications:${agentId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_notifications', filter: `agent_id=eq.${agentId}` }, (payload) => {
        if (cancelled) return;
        const row = payload.new as AgentNotification;
        if (userIdRef.current && row.user_id !== userIdRef.current) return;
        setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : mergeById(prev, [row])));
        if (!row.read_at) setUnread((c) => c + 1);
      })
      .subscribe((status) => {
        if (cancelled || status !== 'SUBSCRIBED') return;
        if (subscribedBefore) void loadHead(false); // a reconnect: catch anything pushed while the socket was down
        subscribedBefore = true;
      });

    return () => {
      cancelled = true;
      generationRef.current++;
      void supabase.removeChannel(channel);
    };
  }, [agentId, loadHead]);

  return { items, unread, loading, loadingMore, hasMore, error, freshIds, loadMore, reload, acknowledge, clearFresh };
}
