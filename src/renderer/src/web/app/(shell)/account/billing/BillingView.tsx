// app/(shell)/account/billing/BillingView.tsx
'use client';

import { AccountPage, Btn } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtAmount, fmtDate, fmtInr, fmtTokens } from '@/components/account/format';
import { HowBillingWorks } from './HowBillingWorks';
import { PurchaseHistory } from './PurchaseHistory';
import { TokenRates } from './TokenRates';
import { tokensForUsd, type TokenPricing } from './tokenPricing';
import { totalAdded, type Purchase } from './purchases';

const LOW_BALANCE_USD = 1;

function BalanceStatus({ balance }: { balance: number }) {
  const [label, fg, bg, line] =
    balance <= 0 ? ['Out of funds · agents paused', '#F2B8AC', 'rgba(179,74,60,0.22)', 'rgba(227,148,127,0.45)']
    : balance < LOW_BALANCE_USD ? ['Running low', '#F3D3A8', 'rgba(181,101,29,0.25)', 'rgba(217,160,106,0.5)']
    : ['Healthy', '#B7E0C2', 'rgba(61,122,79,0.28)', 'rgba(141,186,154,0.5)'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: MONO, fontSize: '0.64rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: fg, background: bg, border: `1px solid ${line}`, borderRadius: 999, padding: '0.2rem 0.6rem' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />
      {label}
    </span>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B9B4A2', margin: '0 0 0.4rem' }}>{label}</p>
      <p style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0, color: '#F7F6F2' }}>{value}</p>
      {sub && <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: '#9E9C8F', margin: '0.3rem 0 0' }}>{sub}</p>}
    </div>
  );
}

/** The Billing tab's body. Pure display: the page loads the wallet and owns the payment modal. */
export function BillingView({ balance, pricing, showInr, usdToInrRate, purchases, onAddFunds }: {
  balance: number;
  pricing: TokenPricing | null;
  showInr: boolean;
  usdToInrRate: number | null;
  purchases: Purchase[];
  onAddFunds: () => void;
}) {
  const lifetime = totalAdded(purchases);
  const last = purchases[0];

  return (
    <AccountPage
      eyebrow="Billing"
      title="Your balance"
      subtitle="Your balance pays for the tokens every agent on your account uses, and for code runs beyond each plan’s monthly allowance. Add funds whenever you like; what you add is listed below."
    >
      {/* Balance */}
      <section style={{ position: 'relative', overflow: 'hidden', background: `radial-gradient(120% 140% at 0% 0%, #3A3526 0%, ${C.ink} 55%)`, color: '#F7F6F2', borderRadius: 12, padding: '1.9rem 2rem', marginBottom: '1.25rem' }}>
        <div aria-hidden="true" style={{ position: 'absolute', right: -60, top: -60, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,162,77,0.22) 0%, rgba(201,162,77,0) 70%)' }} />
        <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1.75rem 2.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
              <p style={{ fontFamily: MONO, fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B9B4A2', margin: 0 }}>Current balance</p>
              <BalanceStatus balance={balance} />
            </div>
            <p style={{ fontSize: '3rem', fontWeight: 500, margin: 0, letterSpacing: '-0.035em', lineHeight: 1, color: balance < 0 ? '#E3937F' : '#F7F6F2' }}>
              {showInr ? `₹${fmtInr(balance * (usdToInrRate ?? 0))}` : `$${fmtAmount(balance)}`}
            </p>
            <p style={{ fontFamily: MONO, fontSize: '0.74rem', color: '#B9B4A2', margin: '0.6rem 0 0' }}>
              {[
                showInr ? `$${fmtAmount(balance)}` : null,
                pricing && balance > 0 ? `about ${fmtTokens(tokensForUsd(balance, pricing.inputPerMillionUsd))} tokens read or ${fmtTokens(tokensForUsd(balance, pricing.outputPerMillionUsd))} written` : null,
              ].filter(Boolean).join(' · ') || 'US dollars'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2.25rem', flexWrap: 'wrap' }}>
            <HeroStat label="Total added" value={`$${fmtAmount(lifetime)}`} sub={`${purchases.length} purchase${purchases.length === 1 ? '' : 's'}`} />
            <HeroStat label="Last top-up" value={last ? `+$${fmtAmount(last.amount)}` : '—'} sub={last ? fmtDate(last.at) : 'none yet'} />
            <Btn variant="brass" onClick={onAddFunds} style={{ padding: '0.7rem 1.4rem', fontSize: '0.88rem' }}>+ Add funds</Btn>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {pricing && <TokenRates pricing={pricing} inrRate={showInr ? usdToInrRate : null} />}
        <HowBillingWorks />
        <PurchaseHistory purchases={purchases} onAddFunds={onAddFunds} />
      </div>
    </AccountPage>
  );
}
