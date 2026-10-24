// src/renderer/src/router/AppRouter.tsx
// The app's own router: it keeps the current address and its history in memory, picks the screen for it (routes.ts) and wraps
// it in the web app's layouts, exactly in the nesting Next.js would use.
import { Component, createElement, useCallback, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';

import { NavContext, RedirectSignal, type NavValue, type RouterApi } from '~/shims/nextNavigation';
import { matchRoute } from '~/router/routes';

interface History {
  stack: string[];
  index: number;
}

function normalise(href: string, currentPath: string): string {
  const noHash = href.split('#')[0] ?? '';
  if (noHash.startsWith('?')) return currentPath + noHash;
  if (noHash.startsWith('/')) return noHash;
  return `/${noHash}`;
}

class RouteBoundary extends Component<{ resetKey: string; onRedirect: (to: string) => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (error instanceof RedirectSignal) { this.props.onRedirect(error.target); return; }
    console.error('Screen error', error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.error instanceof RedirectSignal) return null;
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 380 }}>
          <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: 26, margin: '0 0 8px' }}>Something went wrong.</h1>
          <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#9E9C8F', lineHeight: 1.6 }}>Your data is safe. Reload to carry on.</p>
          <button onClick={() => window.location.reload()} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: '#26251E', color: '#F7F6F2', fontSize: 13, cursor: 'pointer' }}>Reload</button>
        </div>
      </div>
    );
  }
}

/**
 * `desktopOnly` are screens that exist only in the desktop app, by address; `overlay` is drawn on top of every screen (inside the
 * router, so it can navigate). Every other address is a screen from the web app.
 */
export function AppRouter({ initial, desktopOnly = {}, overlay }: { initial: string; desktopOnly?: Record<string, (() => ReactNode) | undefined>; overlay?: ReactNode }) {
  const [history, setHistory] = useState<History>({ stack: [initial], index: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const current = history.stack[history.index] ?? initial;
  const [pathname = '/', query = ''] = current.split('?');
  const search = query ? `?${query}` : '';

  const push = useCallback((href: string) => setHistory((h) => ({ stack: [...h.stack.slice(0, h.index + 1), normalise(href, (h.stack[h.index] ?? '/').split('?')[0]!)], index: h.index + 1 })), []);
  const replace = useCallback((href: string) => setHistory((h) => { const stack = [...h.stack]; stack[h.index] = normalise(href, (h.stack[h.index] ?? '/').split('?')[0]!); return { stack, index: h.index }; }), []);
  const api = useMemo<RouterApi>(() => ({
    push, replace,
    back: () => setHistory((h) => ({ ...h, index: Math.max(0, h.index - 1) })),
    forward: () => setHistory((h) => ({ ...h, index: Math.min(h.stack.length - 1, h.index + 1) })),
    refresh: () => setRefreshKey((k) => k + 1),
    prefetch: () => undefined,
  }), [push, replace]);

  const own = desktopOnly[pathname];
  const match = useMemo(() => (own ? null : matchRoute(pathname)), [pathname, own]);
  const value = useMemo<NavValue>(() => ({ pathname, search, params: match?.params ?? {}, api }), [pathname, search, match, api]);

  let tree: ReactNode;
  if (own) {
    tree = own();
  } else if (!match) {
    tree = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <p style={{ margin: '0 0 12px', color: '#9E9C8F' }}>That page does not exist in the desktop app.</p>
          <button onClick={() => replace('/agents')} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: '#26251E', color: '#F7F6F2', fontSize: 13, cursor: 'pointer' }}>Go to My Agents</button>
        </div>
      </div>
    );
  } else {
    const params = Promise.resolve(match.params);
    tree = createElement(match.Page, { params, key: refreshKey });
    for (let i = match.layouts.length - 1; i >= 0; i--) tree = createElement(match.layouts[i]!, { params }, tree);
  }

  return (
    <NavContext.Provider value={value}>
      <RouteBoundary resetKey={current} onRedirect={replace}>{tree}</RouteBoundary>
      {overlay}
    </NavContext.Provider>
  );
}
