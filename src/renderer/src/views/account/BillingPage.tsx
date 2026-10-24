// src/renderer/src/views/account/BillingPage.tsx
import { Empty, Fact, Loaded, Panel, Row, TabPage, WebNote, shortDate } from '@/components/agent/kit';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/lib/auth';
import { fmtUsd } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { MONO } from '@/lib/theme';

const HISTORY = 25;

interface Credit { id: string; amount: number; reference_id: string | null; created_at: string }
interface Invoice { id: string; invoice_number: string; amount: number; currency: string; issued_at: string; reference_id: string | null }

export function BillingPage() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const state = useAsync<{ balance: number | null; credits: Credit[]; invoices: Invoice[] }>(async () => {
    if (!uid) throw new Error('You are signed out.');
    const [wallet, credits, invoices] = await Promise.all([
      supabase.from('wallets').select('balance_credits').eq('user_id', uid).maybeSingle(),
      supabase.from('wallet_transactions').select('id, amount, reference_id, created_at').eq('user_id', uid).eq('type', 'credit').order('created_at', { ascending: false }).limit(HISTORY),
      supabase.from('invoices').select('id, invoice_number, amount, currency, issued_at, reference_id').eq('user_id', uid).eq('reference_type', 'wallet_topup').order('issued_at', { ascending: false }).limit(HISTORY),
    ]);
    if (credits.error && invoices.error && wallet.error) throw new Error('Your billing details could not be loaded.');
    return {
      balance: wallet.error ? null : wallet.data ? Number((wallet.data as { balance_credits: number }).balance_credits) : 0,
      credits: (credits.data ?? []) as Credit[], invoices: (invoices.data ?? []) as Invoice[],
    };
  }, [uid]);

  return (
    <TabPage title="Billing" subtitle="Your wallet pays for what agents use. One credit is one US dollar.">
      <Loaded state={state}>
        {({ balance, credits, invoices }) => (
          <>
            <Panel title="Wallet">
              <Fact last label="Balance" value={<strong style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{balance === null ? '—' : fmtUsd(balance)}</strong>} />
            </Panel>
            <Panel title="Top-ups" subtitle={`Your last ${HISTORY} payments added to the wallet.`}>
              {credits.length === 0 ? <Empty>No top-ups yet.</Empty> : credits.map((c, i) => (
                <Row key={c.id} last={i === credits.length - 1} primary={`+ ${fmtUsd(Number(c.amount))}`} secondary={c.reference_id ? <span style={{ fontFamily: MONO, fontSize: 12 }}>{c.reference_id}</span> : undefined} right={<span style={{ fontSize: 12.5 }}>{shortDate(c.created_at)}</span>} />
              ))}
            </Panel>
            <Panel title="Invoices">
              {invoices.length === 0 ? <Empty>No invoices yet.</Empty> : invoices.map((v, i) => (
                <Row key={v.id} last={i === invoices.length - 1} primary={<span style={{ fontFamily: MONO, fontSize: 13 }}>{v.invoice_number}</span>} secondary={shortDate(v.issued_at)} right={<span style={{ fontSize: 13.5, fontWeight: 500 }}>{v.currency === 'USD' || !v.currency ? fmtUsd(Number(v.amount)) : `${Number(v.amount).toLocaleString()} ${v.currency}`}</span>} />
              ))}
            </Panel>
          </>
        )}
      </Loaded>
      <WebNote path="/account/billing" label="Top up on the web">Adding money to the wallet and downloading invoices are done in the web app.</WebNote>
    </TabPage>
  );
}
