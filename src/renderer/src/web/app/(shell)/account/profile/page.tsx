// app/(shell)/account/profile/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { forgotPassword } from '@/lib/api';
import { PageLoading } from '@/components/account/ui';
import { ProfileView, type Glance, type Profile } from './ProfileView';

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [glance, setGlance] = useState<Glance | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }
      const user = session.user;

      setEmail(user.email ?? '');
      setUserId(user.id);
      setProvider(user.app_metadata?.provider as string | undefined);
      setLastSignIn(user.last_sign_in_at ?? null);

      const [profileResp, orgResp, networkResp, walletResp] = await Promise.all([
        supabase.from('profiles').select('id, name, avatar, created_at').eq('id', user.id).maybeSingle(),
        supabase.from('organizations').select('id').eq('owner_id', user.id),
        supabase.from('agent_network').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
        supabase.from('wallets').select('balance_credits').eq('user_id', user.id).maybeSingle(),
      ]);

      setProfile(profileResp.data as Profile | null);

      const orgIds = ((orgResp.data as { id: string }[] | null) ?? []).map(o => o.id);
      let agentsOwned = 0;
      if (orgIds.length > 0) {
        const { count } = await supabase.from('agents').select('id', { count: 'exact', head: true }).in('org_id', orgIds);
        agentsOwned = count ?? 0;
      }
      setGlance({
        organizations: orgIds.length,
        agentsOwned,
        agentsConnected: networkResp.count ?? 0,
        balance: Number((walletResp.data as { balance_credits: number } | null)?.balance_credits ?? 0),
      });
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <PageLoading />;

  return (
    <ProfileView
      email={email} userId={userId} provider={provider} lastSignIn={lastSignIn} profile={profile} glance={glance}
      onSaveName={async name => {
        const { error } = await createClient().from('profiles').update({ name }).eq('id', userId);
        return !error;
      }}
      onSignOut={async () => {
        await createClient().auth.signOut();
        router.replace('/auth');
      }}
      onSendReset={async () => !('error' in await forgotPassword(email))}
    />
  );
}
