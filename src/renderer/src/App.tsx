// src/renderer/src/App.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button, Spinner } from '~/components/ui';
import { UpdateBanner } from '~/components/UpdateBanner';
import { VersionTag } from '~/components/VersionTag';
import { AuthProvider, useAuth } from '~/lib/auth';
import { ReplyNotifier } from '~/components/ReplyNotifier';
import { AppRouter } from '~/router/AppRouter';
import { AboutPage } from '~/views/AboutPage';
import { AuthView } from '~/views/AuthView';
import { usePathname } from '~/shims/nextNavigation';

/** A crash anywhere shows a recovery card instead of a blank window. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', background: '#F7F6F2' }}>
        <div style={{ maxWidth: 380 }}>
          <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: 26, margin: '0 0 8px' }}>Something went wrong.</h1>
          <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#9E9C8F', lineHeight: 1.6 }}>Your chats are safe. Reload to carry on.</p>
          <Button label="Reload" onClick={() => window.location.reload()} />
        </div>
      </div>
    );
  }
}

/** Inside the router so it knows which agent's chat is open. */
function ReplyNotifierHost() {
  const pathname = usePathname();
  const open = /^\/agents\/([^/]+)/.exec(pathname)?.[1] ?? null;
  return <ReplyNotifier currentAgentId={open} />;
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div style={{ height: '100%', background: '#F7F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={28} /></div>;
  if (!session) return <AuthView />;
  // Keyed by the person so signing out and in as someone else never shows the previous person's screens.
  return (
    <AppRouter key={session.user.id} initial="/agents" desktopOnly={{ '/desktop': () => <AboutPage /> }} overlay={<><VersionTag /><ReplyNotifierHost /></>} />
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Gate />
        <UpdateBanner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
