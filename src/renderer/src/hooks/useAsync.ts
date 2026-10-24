// src/renderer/src/hooks/useAsync.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs a loader when its inputs change and keeps the latest answer. A slow response for an old input never overwrites a
 * newer one, and a thrown error becomes a message instead of a blank screen.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const mine = ++generation.current;
    setLoading(true);
    void (async () => {
      try {
        const result = await loadRef.current();
        if (mine !== generation.current) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (mine !== generation.current) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
      if (mine === generation.current) setLoading(false);
    })();
    return () => { generation.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
