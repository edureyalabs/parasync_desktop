// app/(shell)/account/billing/TokenRates.tsx
import { C, MONO } from '@/components/account/tokens';
import { Card } from '@/components/account/ui';
import { fmtInr, fmtRate, fmtTokens } from '@/components/account/format';
import { tokensForUsd, type TokenPricing } from './tokenPricing';

// The price list: what a million tokens cost, and what one dollar buys. Quoted in the buyer's currency too when
// they pay in rupees, so the number on this card matches what their statement will say.

function Rate({ label, hint, perMillionUsd, inrRate }: { label: string; hint: string; perMillionUsd: number; inrRate: number | null }) {
  const perDollar = tokensForUsd(1, perMillionUsd);
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 0.5rem' }}>{label}</p>
      <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.35rem 0.6rem' }}>
        <span style={{ fontSize: '1.7rem', fontWeight: 500, letterSpacing: '-0.03em', color: C.ink }}>${fmtRate(perMillionUsd)}</span>
        {inrRate !== null && <span style={{ fontFamily: MONO, fontSize: '0.8rem', color: C.soft }}>₹{fmtInr(perMillionUsd * inrRate, 2)}</span>}
        <span style={{ fontSize: '0.78rem', color: C.soft }}>per 1M tokens</span>
      </p>
      <p style={{ fontSize: '0.78rem', color: C.body, margin: '0.55rem 0 0', lineHeight: 1.55 }}>
        <strong style={{ fontWeight: 500, color: C.ink }}>$1</strong>
        {inrRate !== null && <> (₹{fmtInr(inrRate, 2)})</>} buys about <strong style={{ fontWeight: 500, color: C.ink }}>{fmtTokens(perDollar)}</strong> tokens
      </p>
      <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.3rem 0 0', lineHeight: 1.5 }}>{hint}</p>
    </div>
  );
}

function RunRate({ perRunUsd, charged, inrRate }: { perRunUsd: number; charged: boolean; inrRate: number | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 0.5rem' }}>Code runs past your plan</p>
      <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.35rem 0.6rem' }}>
        <span style={{ fontSize: '1.7rem', fontWeight: 500, letterSpacing: '-0.03em', color: C.ink }}>${String(Number(perRunUsd.toFixed(4)))}</span>
        {inrRate !== null && <span style={{ fontFamily: MONO, fontSize: '0.8rem', color: C.soft }}>₹{fmtInr(perRunUsd * inrRate, 2)}</span>}
        <span style={{ fontSize: '0.78rem', color: C.soft }}>per run</span>
      </p>
      <p style={{ fontSize: '0.78rem', color: C.body, margin: '0.55rem 0 0', lineHeight: 1.55 }}>
        <strong style={{ fontWeight: 500, color: C.ink }}>$1</strong>
        {inrRate !== null && <> (₹{fmtInr(inrRate, 2)})</>} buys about <strong style={{ fontWeight: 500, color: C.ink }}>{Math.floor(1 / perRunUsd).toLocaleString('en-US')}</strong> runs
      </p>
      <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.3rem 0 0', lineHeight: 1.5 }}>
        Each plan includes a monthly allowance of code runs. {charged ? 'Past it, runs are paid from this balance.' : 'Past it, runs will be paid from this balance; nothing is charged for them yet.'}
      </p>
    </div>
  );
}

export function TokenRates({ pricing, inrRate }: { pricing: TokenPricing; inrRate: number | null }) {
  return (
    <Card pad="1.35rem 1.4rem">
      <h2 style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 500, color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 1.1rem' }}>What things cost</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.5rem 2.5rem' }}>
        <Rate label="Tokens read (input)" hint="Everything an agent is given: your messages, its instructions, memory and tool results." perMillionUsd={pricing.inputPerMillionUsd} inrRate={inrRate} />
        <Rate label="Tokens written (output)" hint="Everything an agent produces: replies, plans and the calls it makes to your tools." perMillionUsd={pricing.outputPerMillionUsd} inrRate={inrRate} />
        {pricing.runPriceUsd !== undefined && <RunRate perRunUsd={pricing.runPriceUsd} charged={pricing.runsCharged === true} inrRate={inrRate} />}
      </div>
    </Card>
  );
}
