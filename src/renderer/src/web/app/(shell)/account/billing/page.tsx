// app/(shell)/account/billing/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageLoading } from '@/components/account/ui';
import AddFundsModal from './AddFundsModal';
import { BillingView } from './BillingView';
import { fetchTokenPricing, type TokenPricing } from './tokenPricing';
import { buildPurchases, type TopUpRow, type InvoiceRow } from './purchases';

// The Billing tab is about one thing: the account's balance, what a token costs, and how it was topped up.
// Spending lives on the Usage tab. Both queries below are RLS-scoped to the signed-in user
// (wallet_transactions_self_read, invoices_self_read), and the history is capped at the most
// recent 500 purchases -- far beyond what a wallet accumulates.

const HISTORY_LIMIT = 500;

interface Wallet { balance_credits: number; updated_at: string }

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [topUps, setTopUps] = useState<TopUpRow[]>([]);
  const [pricing, setPricing] = useState<TokenPricing | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<'INR' | 'USD'>('USD');
  const [usdToInrRate, setUsdToInrRate] = useState<number | null>(null);
  const userIdRef = useRef<string | null>(null);

  const fetchHistory = useCallback(async (userId: string) => {
    const supabase = createClient();
    const [topUpResp, invoiceResp] = await Promise.all([
      supabase.from('wallet_transactions')
        .select('id, amount, reference_id, created_at')
        .eq('user_id', userId).eq('type', 'credit')
        .order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
      supabase.from('invoices')
        .select('invoice_number, amount, currency, reference_id')
        .eq('user_id', userId).eq('reference_type', 'wallet_topup')
        .order('issued_at', { ascending: false }).limit(HISTORY_LIMIT),
    ]);
    if (!topUpResp.error) setTopUps((topUpResp.data as TopUpRow[] | null) ?? []);
    if (!invoiceResp.error) setInvoices((invoiceResp.data as InvoiceRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth'); return; }
      const userId = session.user.id;

      userIdRef.current = userId;
      const [walletResp, , ctxResp, pricingResp] = await Promise.all([
        supabase.from('wallets').select('balance_credits, updated_at').eq('user_id', userId).maybeSingle(),
        fetchHistory(userId),
        fetch('/api/wallet/context').then(r => r.json()).catch(() => null),
        fetchTokenPricing(),
      ]);

      setWallet(walletResp.data as Wallet | null);
      setPricing(pricingResp);
      if (ctxResp?.ok) {
        setDisplayCurrency(ctxResp.currency);
        setUsdToInrRate(ctxResp.usdToInrRate);
      }
      setLoading(false);
    })();
  }, [router, fetchHistory]);

  const purchases = useMemo(() => buildPurchases(topUps, invoices), [topUps, invoices]);

  if (loading) return <PageLoading />;

  const balance = wallet?.balance_credits ?? 0;
  const showInr = displayCurrency === 'INR' && usdToInrRate !== null;

  return (
    <>
      <BillingView balance={balance} pricing={pricing} showInr={showInr} usdToInrRate={usdToInrRate} purchases={purchases} onAddFunds={() => setShowAddFunds(true)} />

      {showAddFunds && (
        <AddFundsModal
          currentBalance={balance}
          onClose={() => setShowAddFunds(false)}
          onFundsAdded={newBalance => {
            setWallet(prev => prev ? { ...prev, balance_credits: newBalance } : { balance_credits: newBalance, updated_at: new Date().toISOString() });
            setShowAddFunds(false);
            // The top-up is already written; the invoice follows a moment later, so look twice.
            const userId = userIdRef.current;
            if (userId) {
              void fetchHistory(userId);
              setTimeout(() => { void fetchHistory(userId); }, 2500);
            }
          }}
        />
      )}
    </>
  );
}
