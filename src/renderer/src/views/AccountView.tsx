// src/renderer/src/views/AccountView.tsx
// Account, laid out like the web app: a list of pages on the left, the chosen page on the right.
import { useState } from 'react';

import { SideNav, type SideNavItem } from '@/components/SideNav';
import { useAuth } from '@/lib/auth';
import { AppPage } from '@/views/account/AppPage';
import { BillingPage } from '@/views/account/BillingPage';
import { OrganizationsPage } from '@/views/account/OrganizationsPage';
import { ProfilePage } from '@/views/account/ProfilePage';
import { UsagePage } from '@/views/account/UsagePage';

type Page = 'organizations' | 'billing' | 'usage' | 'profile' | 'app';

const ITEMS: SideNavItem<Page>[] = [
  { key: 'organizations', label: 'Organizations', icon: 'building' },
  { key: 'billing', label: 'Billing', icon: 'wallet' },
  { key: 'usage', label: 'Usage', icon: 'tasks' },
  { key: 'profile', label: 'Profile', icon: 'user' },
  { key: 'app', label: 'This app', icon: 'info' },
];

export function AccountView() {
  const { session } = useAuth();
  const [page, setPage] = useState<Page>('organizations');
  return (
    <>
      <SideNav title="Account" subtitle={session?.user.email} items={ITEMS} active={page} onPick={setPage} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        {page === 'billing' ? <BillingPage /> : page === 'usage' ? <UsagePage /> : page === 'profile' ? <ProfilePage /> : page === 'app' ? <AppPage /> : <OrganizationsPage />}
      </div>
    </>
  );
}
