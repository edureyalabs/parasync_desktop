// src/renderer/src/components/TitleBar.tsx
// The window's own header (the native Windows frame is hidden; the minimise/maximise/close buttons are drawn by Windows over its right end).
// Left: the Parasync Agents wordmark in the landing page's display font, no logo. Right: what is running on this PC right now, as an icon and a
// count each: tool runs in the sealed Linux box ("sandboxes") and browsers. Clicking them opens the About page where the PC is managed.
import { useRunner } from '~/hooks/useRunner';

/** The header is 40 real pixels tall and keeps 146 free at its right end for the window buttons Windows draws over it (three of 46); the page zoom (--ps-zoom, set by the main process) is divided out. */
const HEIGHT = 'calc(40px / var(--ps-zoom, 1))';
const WINDOW_BUTTONS = 'calc(146px / var(--ps-zoom, 1))';

const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

function SandboxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.75" y="2.5" width="12.5" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.6 6.2 6.7 8 4.6 9.8M8.2 10h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrowserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.9 8h12.2M8 1.8c1.8 1.8 2.7 3.9 2.7 6.2S9.8 12.4 8 14.2C6.2 12.4 5.3 10.3 5.3 8S6.2 3.6 8 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function Count({ icon, count, label }: { icon: React.ReactNode; count: number; label: string }) {
  const live = count > 0;
  return (
    <span
      title={label} aria-label={`${count} ${label}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px', borderRadius: 12, border: `1px solid ${live ? '#8C7234' : '#3F3D31'}`, background: live ? 'rgba(161,127,58,0.22)' : 'transparent', color: live ? '#EBD79B' : '#8E8B7C', fontFamily: "'IBM Plex Mono', Consolas, monospace", fontSize: 11.5, lineHeight: 1 }}
    >
      <span className={live ? 'ps-pulse' : undefined} style={{ display: 'inline-flex' }}>{icon}</span>
      {count}
    </span>
  );
}

const STATE_TEXT: Record<string, { text: string; tone: string }> = {
  ready: { text: 'This PC ready', tone: '#7FB28A' },
  busy: { text: 'Working', tone: '#EBD79B' },
  checking: { text: 'Checking…', tone: '#8E8B7C' },
  installing: { text: 'Installing…', tone: '#8E8B7C' },
  'needs-install': { text: 'Setup needed', tone: '#D98F7A' },
  'no-wsl': { text: 'Setup needed', tone: '#D98F7A' },
  error: { text: 'Needs attention', tone: '#D98F7A' },
  off: { text: 'This PC off', tone: '#6F6C5E' },
};

/** `signedIn` shows the PC's status and counts; the sign-in screen only has the wordmark. */
export function TitleBar({ signedIn }: { signedIn: boolean }) {
  const { status } = useRunner();
  const state = STATE_TEXT[status.state] ?? STATE_TEXT['off']!;
  const open = () => window.dispatchEvent(new CustomEvent('ps:navigate', { detail: '/desktop' }));

  return (
    <header
      style={{ ...drag, position: 'fixed', top: 0, left: 0, right: 0, height: HEIGHT, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 18, paddingRight: WINDOW_BUTTONS, background: '#29281F', borderBottom: '1px solid #3A382E', userSelect: 'none' }}
    >
      <span style={{ fontFamily: "'Feelfree', 'Newsreader', Georgia, serif", fontSize: 23, lineHeight: 1, letterSpacing: '0.01em', color: '#F7F6F2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Parasync Agents
      </span>
      {signedIn && (
        <button
          type="button" onClick={open} title="Your PC: what is running now. Click to manage it." className="ps-titlebar-status"
          style={{ ...noDrag, display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 6px 0 10px', border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: state.tone, fontSize: 12, whiteSpace: 'nowrap' }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: state.tone }} />
          <span className="ps-titlebar-text">{state.text}</span>
          <Count icon={<SandboxIcon />} count={status.sandboxRunning ?? 0} label="tool runs in the sandbox on this PC right now" />
          <Count icon={<BrowserIcon />} count={status.browserSessions ?? 0} label="browsers open on this PC right now" />
        </button>
      )}
    </header>
  );
}
