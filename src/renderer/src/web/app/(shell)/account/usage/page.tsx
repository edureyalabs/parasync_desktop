// app/(shell)/account/usage/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AccountPage, Btn, Card, PageLoading } from '@/components/account/ui';
import { C } from '@/components/account/tokens';
import { Segmented } from './Filters';
import { ComputeUsage } from './ComputeUsage';
import { UsageView, type Scope } from './UsageView';
import { useUsageData } from './useUsageData';

// Usage is about cost: what was spent, when, by which agent, on what. Counts and tokens are
// supporting detail. The scope switch chooses whose spend this is:
//   Billed to me  -> everything charged to MY wallet, including other people's use of agents I pay for
//   Used by me    -> calls I made myself, whoever pays for them

const SUBTITLE: Record<Scope, string> = {
  payer: 'What your agents cost you. This is everything charged to your wallet, including people using agents you pay for. Filters apply to everything below.',
  user: 'What you used, whoever pays for it: your own chats and tasks, across every agent you can talk to. Filters apply to everything below.',
};

export default function UsagePage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [scope, setScope] = useState<Scope>('payer');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }
      setAuthed(true);
    })();
  }, [router]);

  const data = useUsageData(scope);

  if (!authed || data.loading) return <PageLoading />;

  return (
    <AccountPage
      eyebrow="Usage"
      title="Where your spend goes"
      subtitle={SUBTITLE[scope]}
      actions={
        <Segmented<Scope>
          label="Whose usage" value={scope} onChange={setScope}
          options={[
            { value: 'payer', label: 'Billed to me', title: 'Charged to your wallet' },
            { value: 'user', label: 'Used by me', title: 'Calls you made, whoever pays' },
          ]}
        />
      }
    >
      {data.error ? (
        <Card style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <p style={{ fontSize: '0.92rem', fontWeight: 500, color: C.ink, margin: '0 0 0.35rem' }}>We couldn&apos;t load your usage</p>
          <p style={{ fontSize: '0.8rem', color: C.soft, margin: '0 0 1.1rem' }}>{data.error}</p>
          <Btn variant="primary" onClick={data.reload}>Try again</Btn>
        </Card>
      ) : (
        <UsageView
          rows={data.rows} windowStart={data.windowStart} today={data.today}
          refetching={data.refetching} scope={scope}
        />
      )}
      {!data.error && <ComputeUsage scope={scope} />}
    </AccountPage>
  );
}
