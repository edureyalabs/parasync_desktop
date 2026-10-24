// src/renderer/src/App.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Shell } from '@/components/Shell';
import { Button, Center, Spinner } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { NavProvider, useNav } from '@/lib/nav';
import { C } from '@/lib/theme';
import { AccountView } from '@/views/AccountView';
import { AgentsView } from '@/views/AgentsView';
import { AuthView } from '@/views/AuthView';
import { DiscoverView } from '@/views/DiscoverView';
import { RequestsView } from '@/views/RequestsView';

/** A crash in one screen shows a recovery card instead of a blank window. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Center>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: 26, margin: '0 0 8px' }}>Something went wrong.</h1>
          <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.soft, lineHeight: 1.6 }}>Your chats are safe. Reload to carry on.</p>
          <Button label="Reload" onClick={() => window.location.reload()} />
        </div>
      </Center>
    );
  }
}

function Section() {
  const { section } = useNav();
  switch (section) {
    case 'discover': return <DiscoverView />;
    case 'requests': return <RequestsView />;
    case 'account': return <AccountView />;
    default: return <AgentsView />;
  }
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div style={{ height: '100%', background: C.bg }}><Center><Spinner size={28} /></Center></div>;
  if (!session) return <AuthView />;
  // Keyed by user so signing out and in as someone else never shows the previous person's state.
  return (
    <NavProvider key={session.user.id}>
      <Shell><Section /></Shell>
    </NavProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ErrorBoundary>
  );
}
