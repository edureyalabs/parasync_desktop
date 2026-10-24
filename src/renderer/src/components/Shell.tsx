// src/renderer/src/components/Shell.tsx
import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';
import { useNav, type Section } from '@/lib/nav';
import { C, MONO } from '@/lib/theme';
import logo from '@/assets/logo.png';

const NAV: { key: Section; label: string; icon: IconName }[] = [
  { key: 'agents', label: 'My Agents', icon: 'chat' },
  { key: 'discover', label: 'Discover', icon: 'store' },
  { key: 'requests', label: 'Invitations', icon: 'mail' },
  { key: 'account', label: 'Account', icon: 'user' },
];

/** The WhatsApp-Web-style frame: a dark icon strip on the left, the active section filling the rest. */
export function Shell({ children }: { children: ReactNode }) {
  const { section, go } = useNav();
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <UpdateBanner />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <nav aria-label="Main" style={{ width: 68, flexShrink: 0, background: C.rail, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 6 }}>
          <img src={logo} alt="Parasync" width={32} height={32} draggable={false} style={{ borderRadius: 8, border: `2px solid ${C.bg}`, marginBottom: 20 }} />
          {NAV.map((item) => {
            const active = section === item.key;
            return (
              <button
                key={item.key} onClick={() => go(item.key)} title={item.label} aria-label={item.label} aria-current={active ? 'page' : undefined}
                className={active ? undefined : 'ps-rail-btn'}
                style={{ width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? C.ink : C.soft, background: active ? C.bg : 'transparent', transition: 'background 0.12s, color 0.12s' }}
              >
                <Icon name={item.icon} size={21} />
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          {email && (
            <div title={email} style={{ width: 32, height: 32, borderRadius: '50%', background: '#3A3830', color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>
              {initials(email)}
            </div>
          )}
          <button onClick={() => void signOut()} title="Sign out" aria-label="Sign out" className="ps-rail-btn" style={{ width: 44, height: 44, borderRadius: 10, border: 'none', background: 'transparent', color: C.soft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="logout" size={19} />
          </button>
        </nav>
        <main style={{ flex: 1, minWidth: 0, display: 'flex', background: C.bg }}>{children}</main>
      </div>
    </div>
  );
}
