// components/agent-ui/AgentPage.tsx
'use client';

import type { ReactNode } from 'react';
import { AccountPage } from '@/components/account/ui';

// The frame of an agent tab that uses the Account UI kit (Add Users, Agent Profile): the scroll area the other
// tabs fill, with the kit's page header and hover styles inside it, so these tabs read like Billing and Usage.
export function AgentPage({ eyebrow, title, subtitle, actions, maxWidth = 1120, children }: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  maxWidth?: number | string;
  children: ReactNode;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: '#F7F6F2', fontFamily: "'Inter', 'Helvetica Neue', sans-serif", color: '#26251E' }}>
      <AccountPage compact eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} maxWidth={maxWidth}>
        {children}
      </AccountPage>
    </div>
  );
}
