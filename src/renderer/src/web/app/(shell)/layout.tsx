// app/(shell)/layout.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { DesktopNavFooter } from '@/components/local-copy/LocalCopy';

const NAV = [
  {
    key: 'agents', href: '/agents', label: 'My Agents',
    icon: (
      <svg width="21" height="21" viewBox="0 0 21 21" fill="none">
        <path d="M3 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3.5v-3.5H5a2 2 0 0 1-2-2v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'marketplace', href: '/marketplace', label: 'Marketplace',
    icon: (
      <svg width="21" height="21" viewBox="0 0 21 21" fill="none">
        <path d="M3.5 8.5 4.7 4h11.6l1.2 4.5M3.5 8.5v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7M3.5 8.5h13.5M7 8.5v2a2.5 2.5 0 0 0 5 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'requests', href: '/requests', label: 'Requests',
    icon: (
      <svg width="21" height="21" viewBox="0 0 21 21" fill="none">
        <path d="M3.5 5.5h14v10h-14v-10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M3.5 5.5l7 5.5 7-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'account', href: '/account/organizations', label: 'Account',
    icon: (
      <svg width="21" height="21" viewBox="0 0 21 21" fill="none">
        <circle cx="10.5" cy="7.2" r="3.2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 17c.9-3.2 3.6-5 6.5-5s5.6 1.8 6.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

function LogoutIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none">
      <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v10A1.5 1.5 0 0 0 4.5 16H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 13l4-4-4-4M16 9H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function initials(text: string): string {
  return text.slice(0, 2).toUpperCase();
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      setUserEmail(session?.user.email ?? null);
    })();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/auth');
  };

  return (
    <div style={{ height: '100vh', display: 'flex', fontFamily: "'Inter','Helvetica Neue',sans-serif", color: '#26251E', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Icon strip */}
      <nav style={{
        width: 68, flexShrink: 0, background: '#29281F', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '1rem 0', gap: '0.35rem',
      }}>
        <Link href="/agents" style={{ marginBottom: '1.25rem', display: 'flex' }}>
          <Image src="/logo.png" alt="Parasync" width={32} height={32} style={{ borderRadius: 8, border: '2px solid #F7F6F2' }} />
        </Link>

        {NAV.map(item => {
          const active = pathname.startsWith('/agents') && item.key === 'agents'
            ? true
            : item.key !== 'agents' && pathname.startsWith(item.href.split('/').slice(0, 2).join('/'));
          return (
            <Link key={item.key} href={item.href} title={item.label} style={{ textDecoration: 'none' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: active ? '#26251E' : '#9E9C8F',
                background: active ? '#F7F6F2' : 'transparent',
                transition: 'background 0.12s, color 0.12s',
              }}>
                {item.icon}
              </div>
            </Link>
          );
        })}

        <div style={{ flex: 1 }} />

        {userEmail && (
          <div title={userEmail} style={{
            width: 32, height: 32, borderRadius: '50%', background: '#3A3830', color: '#F7F6F2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.65rem', marginBottom: '0.6rem', flexShrink: 0,
          }}>
            {initials(userEmail)}
          </div>
        )}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          title="Sign out"
          style={{ width: 44, height: 44, borderRadius: 10, border: 'none', background: 'transparent', color: '#9E9C8F', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <LogoutIcon />
        </button>
        <DesktopNavFooter />
      </nav>

      {/* Everything else */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', background: '#F7F6F2' }}>
        {children}
      </div>
    </div>
  );
}
