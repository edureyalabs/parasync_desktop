// components/notifications/useNotifications.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageAttachment } from '@/components/Attachments';
import { createClient } from '@/lib/supabase/client';

// The notification feed for ONE agent and the signed-in user: the newest page, older
// pages on demand (keyset pagination), a live unread count, and realtime inserts.
// Rows are written only by bemain's `push_notification` node; RLS already limits what
// this client can read to the caller's own rows, the explicit user filter just lets
// Postgres use the feed index.

export const PAGE_SIZE = 10;

// Every column (`*`), so the feed keeps working before and after the projects migration adds project_id / reply_text / replied_at.
const COLUMNS = '*';

export interface AgentNotification {
  id: string;
  agent_id: string;
  user_id: string;
  task_id: string | null;
  run_id: string | null;
  /** What sort of notification this is (see kinds.ts for the labels). Open-ended: new kinds need no migration. */
  kind: string;
  /** One line of the task's definition as it was when this entry was pushed. */
  task_label: string;
  /** Markdown. */
  body: string;
  attachments: MessageAttachment[] | null;
  created_at: string;
  read_at: string | null;
  /** A project agent's question to the person (kind 'project_question'): the project it belongs to, and the answer once given. */
  project_id?: string | null;
  reply_text?: string | null;
  replied_at?: string | null;
}

export interface NotificationsState {
  items: AgentNotification[];
  unread: number;
  /** The first page is still loading. */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Entries that were unread when the feed was last opened -- highlighted while it stays open. */
  freshIds: ReadonlySet<string>;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
  /** Marks everything read (the badge clears) and remembers which entries were new. Takes the
   *  caller's current items and unread count, so it never acts on a render-old copy. */
  acknowledge: (current: { items: AgentNotification[]; unread: number }) => Promise<void>;
  clearFresh: () => void;
}

/** Newest first; id breaks ties -- the same order the keyset query pages in. */
function newestFirst(a: AgentNotification, b: AgentNotification): number {
  const byTime = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (byTime) return byTime;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

function mergeById(existing: AgentNotification[], incoming: AgentNotification[]): AgentNotification[] {
  const byId = new Map(existing.map(n => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return [...byId.values()].sort(newestFirst);
}

export function useNotifications(agentId: string): NotificationsState {
  const supabaseRef = useRef(createClient());
  const userIdRef = useRef<string | null>(null);
  // Bumped on every (re)load so a slow response from an earlier load can never overwrite a newer one.
  const generationRef = useRef(0);

  const [items, setItems] = useState<AgentNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());

  // Latest values for callbacks that must stay stable (they are effect dependencies).
  const itemsRef = useRef(items);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(false);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  const resolveUserId = useCallback(async (): Promise<string | null> => {
    if (userIdRef.current) return userIdRef.current;
    const { data: { session } } = await supabaseRef.current.auth.getSession();
    userIdRef.current = session?.user.id ?? null;
    return userIdRef.current;
  }, []);

  const fetchUnreadCount = useCallback(async (userId: string): Promise<number | null> => {
    const { count, error: countError } = await supabaseRef.current
      .from('agent_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId).eq('user_id', userId).is('read_at', null);
    return countError ? null : (count ?? 0);
  }, [agentId]);

  /** The newest page plus the unread count. `replace` swaps the list; otherwise it is merged in
   *  (used after a realtime reconnect, to catch anything pushed while the socket was down). */
  const loadHead = useCallback(async (replace: boolean) => {
    const generation = ++generationRef.current;
    const userId = await resolveUserId();
    if (!userId) { setLoading(false); return; }

    const [page, count] = await Promise.all([
      supabaseRef.current.from('agent_notifications').select(COLUMNS)
        .eq('agent_id', agentId).eq('user_id', userId)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .limit(PAGE_SIZE + 1),
      fetchUnreadCount(userId),
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
      setItems(prev => mergeById(prev, rows.slice(0, PAGE_SIZE)));
    }
    if (count !== null) setUnread(count);
    setLoading(false);
  }, [agentId, fetchUnreadCount, resolveUserId]);

  const reload = useCallback(async () => {
    setLoading(true);
    await loadHead(true);
  }, [loadHead]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const last = itemsRef.current[itemsRef.current.length - 1];
    const userId = userIdRef.current;
    if (!last || !userId) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const generation = generationRef.current;
    try {
      // Keyset: strictly older than the last row we have, with id breaking created_at ties.
      const { data, error: pageError } = await supabaseRef.current
        .from('agent_notifications').select(COLUMNS)
        .eq('agent_id', agentId).eq('user_id', userId)
        .or(`created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (generation !== generationRef.current) return;
      if (pageError) { setError('Could not load older notifications.'); return; }
      const rows = (data ?? []) as AgentNotification[];
      setError(null);
      setItems(prev => mergeById(prev, rows.slice(0, PAGE_SIZE)));
      setHasMore(rows.length > PAGE_SIZE);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [agentId]);

  const acknowledge = useCallback(async (current: { items: AgentNotification[]; unread: number }) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const newIds = current.items.filter(n => !n.read_at).map(n => n.id);
    if (newIds.length === 0 && current.unread === 0) return;

    const nowIso = new Date().toISOString();
    if (newIds.length) setFreshIds(prev => new Set([...prev, ...newIds]));
    setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: nowIso })));
    setUnread(0);

    // Best effort. A failed write only means the entries show as unread again on the next
    // full load -- never worth interrupting the person for, and never retried in a loop.
    const { error: updateError } = await supabaseRef.current
      .from('agent_notifications').update({ read_at: nowIso })
      .eq('agent_id', agentId).eq('user_id', userId).is('read_at', null);
    if (updateError) console.warn('Could not mark notifications read:', updateError.message);
  }, [agentId]);

  const clearFresh = useCallback(() => setFreshIds(new Set()), []);

  // First load, then live inserts. The channel's status callback also fires on every
  // reconnect, which is when a gap could have opened, so later SUBSCRIBEDs re-fetch the head.
  useEffect(() => {
    let cancelled = false;
    let subscribedBefore = false;
    const supabase = supabaseRef.current;
    const generation = generationRef; // a counter, not a DOM ref: the cleanup must see its latest value

    void loadHead(true);

    const channel = supabase
      .channel(`agent-notifications:${agentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_notifications', filter: `agent_id=eq.${agentId}` },
        payload => {
          if (cancelled) return;
          const row = payload.new as AgentNotification;
          if (userIdRef.current && row.user_id !== userIdRef.current) return;
          setItems(prev => (prev.some(n => n.id === row.id) ? prev : mergeById(prev, [row])));
          if (!row.read_at) setUnread(count => count + 1);
        },
      )
      .subscribe(status => {
        if (cancelled || status !== 'SUBSCRIBED') return;
        if (subscribedBefore) void loadHead(false);
        subscribedBefore = true;
      });

    return () => {
      cancelled = true;
      generation.current++;
      void supabase.removeChannel(channel);
    };
  }, [agentId, loadHead]);

  return { items, unread, loading, loadingMore, hasMore, error, freshIds, loadMore, reload, acknowledge, clearFresh };
}
