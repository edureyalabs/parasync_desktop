// app/(shell)/account/layout.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { DesktopAccountLinks } from '@/components/local-copy/LocalCopy';

// Profile is deliberately last: the tabs people come back to (their workspaces, their
// balance, what they spent) come first; the one-time account details come after.
const SECTIONS = [
  { key: 'organizations', label: 'Organizations', href: '/account/organizations' },
  { key: 'billing',       label: 'Billing',       href: '/account/billing' },
  { key: 'usage',         label: 'Usage',         href: '/account/usage' },
  { key: 'profile',       label: 'Profile',       href: '/account/profile' },
];

function initials(text: string): string {
  return text.slice(0, 2).toUpperCase();
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }
      setEmail(session.user.email ?? null);
    })();
  }, [router]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', background: '#F7F6F2', fontFamily: "'Inter', 'Helvetica Neue', sans-serif", color: '#26251E' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Internal sidebar — sub-navigation within the Account section */}
      <aside style={{ width: 216, flexShrink: 0, borderRight: '1px solid #E2DFD3', padding: '2rem 1rem', display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#9E9C8F', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0.6rem 1rem' }}>
          Account
        </p>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          {SECTIONS.map(s => {
            const active = pathname.startsWith(s.href);
            return (
              <Link key={s.key} href={s.href} style={{ textDecoration: 'none' }}>
                <span style={{
                  display: 'block', padding: '0.55rem 0.65rem', fontSize: '0.85rem', borderRadius: 5,
                  fontFamily: "'Inter', sans-serif", transition: 'background 0.12s, color 0.12s',
                  background: active ? '#26251E' : 'transparent',
                  color: active ? '#F7F6F2' : '#3A3830',
                  fontWeight: active ? 500 : 400,
                }}>
                  {s.label}
                </span>
              </Link>
            );
          })}
          <DesktopAccountLinks />
        </nav>

        <div style={{ flex: 1 }} />

        {email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', borderTop: '1px solid #E2DFD3', paddingTop: '1rem', margin: '0 0.6rem' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#3A3830', color: '#F7F6F2',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem',
            }}>
              {initials(email)}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email}
            </p>
          </div>
        )}
      </aside>

      {/* Section content */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
