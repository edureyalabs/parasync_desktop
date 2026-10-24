// src/renderer/src/views/agent/SignedApisTab.tsx
import { Chip } from '@/components/ui';
import { Empty, Loaded, OnOff, Panel, Row, TabPage, WebNote } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { apiGet } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { TabProps } from '@/views/agent/types';

interface Provider { key: string; name: string; description: string; actions?: { name: string }[] }
interface Data { providers: Provider[]; enabled: Map<string, { enabled: boolean; available_to_members: boolean }>; mine: Set<string> }

export function SignedApisTab({ agentId, ctx }: TabProps) {
  const state = useAsync<Data>(async () => {
    const [rows, creds, catalog] = await Promise.all([
      supabase.from('agent_signed_apis').select('provider_key, enabled, available_to_members').eq('agent_id', agentId),
      // Only which providers this person has connected: the saved values themselves are never requested.
      supabase.from('agent_signed_api_credentials').select('provider_key').eq('agent_id', agentId),
      apiGet<{ providers?: Provider[] }>('/api/signed-apis'),
    ]);
    if (rows.error) throw new Error('The database integrations could not be loaded.');
    const enabled = new Map<string, { enabled: boolean; available_to_members: boolean }>();
    for (const r of (rows.data ?? []) as { provider_key: string; enabled: boolean; available_to_members: boolean }[]) enabled.set(r.provider_key, r);
    const known = catalog.ok && Array.isArray(catalog.data.providers) ? catalog.data.providers : [];
    const providers = known.length > 0 ? known : [...enabled.keys()].map((k) => ({ key: k, name: k, description: '' }));
    return { providers, enabled, mine: new Set(((creds.data ?? []) as { provider_key: string }[]).map((c) => c.provider_key)) };
  }, [agentId]);

  return (
    <TabPage title="Database Integrations" subtitle="Curated, signed access to databases and storage (Amazon Athena, Snowflake, BigQuery, Azure Storage, S3-compatible). Each person connects their own account.">
      <Loaded state={state}>
        {(d) => {
          const visible = ctx.isOwner ? d.providers : d.providers.filter((p) => d.enabled.get(p.key)?.enabled && d.enabled.get(p.key)?.available_to_members);
          return (
            <Panel>
              {visible.length === 0 ? <Empty>No database integrations are available.</Empty> : visible.map((p, i) => {
                const s = d.enabled.get(p.key);
                return (
                  <Row
                    key={p.key} last={i === visible.length - 1} primary={p.name}
                    secondary={p.description ? `${p.description}${p.actions?.length ? ` · actions: ${p.actions.map((a) => a.name).join(', ')}` : ''}` : undefined}
                    right={<>
                      {ctx.isOwner && ctx.agent.visibility !== 'personal' && s?.enabled && s.available_to_members && <Chip label="Users can connect" tone="brass" />}
                      <Chip label={d.mine.has(p.key) ? 'You are connected' : 'Not connected'} tone={d.mine.has(p.key) ? 'green' : 'neutral'} />
                      {ctx.isOwner && <OnOff on={!!s?.enabled} />}
                    </>}
                  />
                );
              })}
            </Panel>
          );
        }}
      </Loaded>
      <WebNote path={`/agents/${agentId}/signed-apis`}>Switching an integration on and entering your account details is done in the web app for now.</WebNote>
    </TabPage>
  );
}
